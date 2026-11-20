import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { learningStore } from '@/lib/learningStore';
import { apiJson } from '@/api/http';
import { examSelection, examDraftKey } from '@/lib/examSelection';
import { examPath, questionBankPath, BANK_TASK_TYPES, getBankTask } from '../../shared/questionBank';
import '@/learning.css';

export default function ExamPreparation() {
  const location = useLocation(), navigate = useNavigate(), { user } = useAuth();
  const params = new URLSearchParams(location.search), selection = examSelection(params);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [sessionMode, setSessionMode] = useState(params.get('sessionMode') || (selection?.task?.type?.includes('mock') ? 'exam' : 'practice'));
  const lock = useRef(false);
  if (!selection) return <main className="learning-page"><h1>Practice unavailable</h1><Link to="/exam">Choose a task</Link></main>;
  const { task, questionIndex } = selection;
  const part = selection.part || null, mock = task.type === 'mock' || task.type === 'ielts-mock';
  const questionCount = task.prompts.filter((_, index) => !part || task.steps?.[index]?.part === part).length;
  const parentId = params.get('retry') || null, focus = params.get('focus') || '';
  const title = task.type === 'ielts-mock' ? `IELTS Speaking · ${part ? `Part ${part}` : 'Full Mock Test'}` : task.bankTaskType ? `${task.exam === 'ielts' ? 'IELTS Speaking · ' : ''}${BANK_TASK_TYPES.find(type => type.id === task.bankTaskType).title}` : `${task.exam === 'ielts' ? 'IELTS Speaking' : 'TOEFL Speaking'} · ${task.title.split(' · ')[0]}`;
  const back = task.type === 'ielts-paired' ? questionBankPath('ielts-part2') : task.bankTaskType ? questionBankPath(task.bankTaskType) : task.exam === 'ielts' ? '/exam/ielts' : '/exam';
  const followUp = task.steps?.some(step => step.type === 'part2-followup');
  const related = task.relatedSetId ? getBankTask(task.relatedSetId) : null;
  const repeat = task.type === 'listen-repeat';
  async function begin() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (parentId) {
        let original = await learningStore.get('attempts', parentId);
        if (original?.ownerId && original.ownerId !== user?.id) original = null;
        if (!original && user) original = await apiJson('/api/speaking-practice', { action: 'get', id: parentId });
        if (original?.taskId !== task.id) throw new Error('The original practice does not match this question set.');
      }
      const key = examDraftKey(user?.id, task.id, parentId, focus, questionIndex, part, sessionMode);
      const saved = await learningStore.get('drafts', key);
      const session = params.get('session');
      if (session) {
        const completed = await learningStore.get('attempts', session);
        if (completed?.taskId === task.id && (!completed.ownerId || completed.ownerId === user?.id)) { navigate(`/practice/review?id=${session}`, { replace: true }); return; }
        if (!saved || saved.attemptId !== session) throw new Error('This unfinished practice is unavailable. Return to the question bank.');
      }
      const value = saved ? { ...saved, stage: 'exam' } : {
        id: key, attemptId: crypto.randomUUID(), track: 'exam', taskId: task.id,
        ...(task.setId ? { setId: task.setId, taskType: task.bankTaskType, questionId: questionIndex === null ? null : task.questions[questionIndex].questionId } : {}),
        answers: [], parentId, focus, part, sessionMode, examinerTurns: [], question: questionIndex === null ? null : String(questionIndex),
        practiceMode: questionIndex !== null ? 'quick' : mock ? 'mock' : 'set',
        ownerId: user?.id || null, createdAt: new Date().toISOString(), stage: 'exam'
      };
      await apiJson('/api/membership', { action: 'start', id: value.attemptId, taskId: task.id, kind: 'exam', part, sessionMode });
      await learningStore.put('drafts', value);
      const target = examPath(task, { questionIndex, part, parentId, focus, sessionMode, session: value.attemptId, stage: 'practice' });
      navigate(mock ? `${target}&autostart=1` : target, { replace: true });
    } catch (e) { setError(e.message); }
    finally { lock.current = false; setBusy(false); }
  }
  return <main className="learning-page preparation-page"><header><Link to={back}>← {task.setId || task.type === 'ielts-paired' ? 'Change topic · Question bank' : 'Tasks'}</Link></header>
    <section className="exam-intro" aria-label="Practice preparation"><h1>{title}</h1>
      <p className="preparation-selection">{task.setTitle || task.title}{' · '}{questionIndex === null ? `${questionCount} ${repeat ? questionCount === 1 ? 'sentence' : 'sentences' : questionCount === 1 ? 'question' : 'questions'}` : `${repeat ? 'Sentence' : 'Question'} ${questionIndex + 1}`}</p>
      <p>{task.type === 'ielts-mock' ? 'Meet your examiner, answer familiar questions, prepare a cue card, then discuss the same topic in more depth.' : task.type === 'ielts-paired' ? 'Prepare your cue card, give your long answer, then discuss the same topic in Part 3.' : task.type === 'part1' ? 'Answer questions about familiar topics.' : task.type === 'part2' ? followUp ? 'Speak about a topic, then answer a follow-up question.' : 'Prepare your ideas, then speak about the cue card topic.' : task.type === 'part3' ? 'Discuss ideas and give reasons for your views.' : repeat ? 'Listen and repeat each sentence.' : task.type === 'mock' ? 'Complete seven repetitions and four interview answers.' : 'Answer questions about campus life.'}</p>
      {focus && <p className="retry-goal"><strong>Your focus for this take</strong><br />{focus}</p>}
      <fieldset className="exam-mode-picker"><legend>Session mode</legend><label><input type="radio" name="session-mode" value="practice" checked={sessionMode === 'practice'} onChange={() => setSessionMode('practice')} />Practice <span>Replay audio, review your take, and reveal the reference only when you choose.</span></label><label><input type="radio" name="session-mode" value="exam" checked={sessionMode === 'exam'} onChange={() => setSessionMode('exam')} />Exam <span>One playback and one take. References and transcript review unlock after submission.</span></label></fieldset>
      <p className="learning-muted">{task.type === 'ielts-mock' ? part ? `Part ${part} practice. Recording and transitions follow the selected part.` : 'Part 1 → Part 2 → Part 3. Target 11–14 minutes. Your answers progress after a completed speaking pause; you can also stop an answer manually.' : task.type === 'part2' ? followUp ? '1 minute to prepare, up to 2 minutes to speak; 30-second practice limit for the follow-up.' : '1 minute to prepare, up to 2 minutes to speak.' : task.type === 'mock' ? '8–12 seconds per repetition; 45 seconds per interview answer (practice limits).' : `${task.timing.answerSeconds} seconds per answer (practice limit).`}</p>
      {related && <p className="preparation-related"><Link to={examPath(related)}>Related {related.type === 'part3' ? 'Part 3 discussion' : 'Part 2 cue card'} → {related.setTitle}</Link></p>}
      <button className="primary" disabled={busy} onClick={begin}>{busy ? 'Opening…' : sessionMode === 'exam' ? 'Start Exam' : 'Start Practice'}</button>
      {error && <p role="alert">{error} <Link to="/membership">Membership &amp; allowance</Link></p>}
    </section>
  </main>;
}
