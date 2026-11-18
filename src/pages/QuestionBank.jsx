import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { learningStore } from '@/lib/learningStore';
import { apiJson } from '@/api/http';
import { ALL_QUESTION_SETS, BANK_TASK_TYPES, getBankTask, examPath, setProgress, examHomePath } from '../../shared/questionBank';
import '@/learning.css';
import { bankAccess } from '@/lib/bankAccess';

export default function QuestionBank() {
  const { taskType } = useParams(), { user } = useAuth();
  const [search, setSearch] = useState(''), [category, setCategory] = useState('all'), [filter, setFilter] = useState('all');
  const [attempts, setAttempts] = useState([]), [drafts, setDrafts] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  useEffect(() => { setSearch(''); setCategory('all'); setFilter('all'); }, [taskType]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setAttempts([]); setDrafts([]);
    (async () => {
      const local = (await learningStore.all('attempts')).filter(item => !item.ownerId || item.ownerId === user?.id);
      const saved = (await learningStore.all('drafts')).filter(item => item.id.startsWith(`exam:${user?.id || 'guest'}:`));
      if (!active) return;
      setAttempts(local); setDrafts(saved);
      if (user) {
        const remote = await apiJson('/api/speaking-practice', { action: 'list' });
        const merged = new Map(local.map(item => [item.id, item]));
        remote.forEach(item => merged.set(item.id, item));
        if (active) setAttempts([...merged.values()]);
      }
    })().catch(e => active && setError(`Progress unavailable: ${e.message}`)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [user?.id, revision]);
  const type = BANK_TASK_TYPES.find(item => item.id === taskType);
  if (!type) return <main className="learning-page"><h1>Question bank unavailable</h1><Link to="/exam">Choose a task type</Link></main>;
  const ielts = taskType.startsWith('ielts-');
  const sets = ALL_QUESTION_SETS.filter(set => set.taskType === taskType && (!bankAccess.access.fullQuestionBank || !set.isDemo));
  const categories = [...new Set(sets.flatMap(set => set.categories))];
  const query = search.trim().toLocaleLowerCase();
  const filtered = sets.map(set => ({ set, progress: setProgress(set, attempts, drafts) })).filter(({ set, progress }) =>
    (category === 'all' || set.categories.includes(category)) &&
    (!query || [set.setTitle, set.sourceDate, ...set.questions.flatMap(question => [question.questionText, ...(question.cuePoints || [])])].some(text => text.toLocaleLowerCase().includes(query))) &&
    (filter === 'all' || !loading && !error && (filter === 'completed' ? progress.status === 'Completed' : filter === 'in-progress' ? progress.status === 'In progress' : progress.status !== 'Completed')));
  function resumePath(task, draft, questionIndex = null) {
    return examPath(task, { questionIndex, ...(draft ? { parentId: draft.parentId, focus: draft.focus, sessionMode: draft.sessionMode, session: draft.attemptId, stage: 'practice' } : {}) });
  }
  return <main className="learning-page bank-page"><header><Link to={examHomePath(ielts ? 'ielts' : 'toefl')}>← {ielts ? 'IELTS' : 'TOEFL'} Speaking</Link><Link to="/progress">My Progress</Link></header>
    <h1>{type.title}</h1><p className="learning-muted">{sets.length} sets · {sets.reduce((sum, set) => sum + set.questions.length, 0)} {taskType === 'repeat' ? 'sentences' : 'questions'}</p>
    <div className="bank-controls"><label>Search<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={ielts ? "Topic, date or question · 话题搜索" : "Set name, date or question"} /></label>
      <label>Category<select aria-label="Category" value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Practice status<select aria-label="Practice status" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All sets</option><option value="unfinished">Not completed</option><option value="in-progress">In progress</option><option value="completed">Completed</option></select></label>
    </div>
    {loading && <p role="status">Loading practice progress…</p>}
    {error && <p role="alert">{error} <button onClick={() => setRevision(n => n + 1)}>Retry progress</button></p>}
    <p className="sr-only" role="status" aria-live="polite">{filtered.length} sets shown</p>
    <div className="bank-sets">{filtered.map(({ set, progress }) => {
      const task = getBankTask(set.setId), draft = progress.drafts.find(item => item.question === null || item.question === undefined);
      return <article className="bank-set" key={set.setId} data-set-id={set.setId}>
        <Link className="bank-set-link" to={resumePath(task, draft)} aria-label={`${draft ? 'Continue' : 'Practise set'}: ${set.setTitle}, ${set.sourceDate}`}><h2>{set.setTitle}</h2><p>{set.questions.length} {taskType === 'repeat' ? set.questions.length === 1 ? 'sentence' : 'sentences' : set.questions.length === 1 ? 'question' : 'questions'} · {set.sourceDate}{ielts && ` · ${set.categories.join(" / ")}`}</p>
          <span className="bank-progress">{loading ? 'Loading progress…' : error ? 'Progress unavailable' : `${progress.status} · ${progress.answered}/${progress.total} practised`}{draft && ' · Continue set'}</span>
        </Link>
        {set.relatedSetId && <Link className="bank-related" to={examPath(getBankTask(set.relatedSetId))}>Related {taskType === 'ielts-part2' ? 'Part 3 discussion' : 'Part 2 cue card'} →</Link>}
        <details><summary>Choose a single {taskType === 'repeat' ? 'sentence' : 'question'}</summary><ol>{set.questions.map((question, index) => {
          const singleDraft = progress.drafts.find(item => item.question !== null && item.question !== undefined && Number(item.question) === index);
          return <li key={question.questionId}><Link to={resumePath(task, singleDraft, index)}><span>{question.questionOrder}. {question.questionText}</span>{!loading && !error && <small>{singleDraft ? 'Continue' : progress.completed.has(question.questionId) ? 'Practised' : 'Practise'}</small>}</Link></li>;
        })}</ol></details>
      </article>;
    })}</div>
    {!filtered.length && !loading && <p>No matching sets. Change your search or filters.</p>}
    <details className="bank-source"><summary>Sources and audio</summary>{ielts ? <><p>Practice questions from your two September–December 2026 IELTS PDFs. Exact repeats are merged; wording variants remain available. New and retained labels follow each source.</p><p>Reference answers, when supplied, appear after you answer. Question playback uses generated speech.</p></> : <><p>User-supplied recalled practice, not official ETS questions. Original recordings were not supplied; playback uses browser-generated speech.</p>{taskType === 'interview' && <p>Source reference answers are available after you answer. Set sizes follow the supplied document.</p>}</>}</details>
  </main>;
}
