import { useEffect, useMemo, useRef, useState } from 'react';
import { subscribeActivitySync } from '@/lib/activitySync';
import { useAuth } from '@/lib/AuthContext';
import { learningStore } from '@/lib/learningStore';
import { apiJson } from '@/api/http';
import { mergeLearningRecords, learningInsights } from '@/lib/learningDashboard';
import { getSpeakingTask } from '../../shared/speakingTasks';
import { examPath } from '../../shared/questionBank';
export function useLearningRecords() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]), [drafts, setDrafts] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [revision, setRevision] = useState(0), [detailedInsights, setDetailedInsights] = useState(false);
  const lastOwner = useRef(undefined);
  useEffect(() => subscribeActivitySync(() => setRevision(value => value + 1)), []);
  useEffect(() => {
    if (lastOwner.current !== user?.id) { setRecords([]); setDrafts([]); setDetailedInsights(false); lastOwner.current = user?.id; }
    let active = true; const controller = new AbortController(); setLoading(true); setError('');
    (async () => {
      const [device, unfinished] = await Promise.allSettled([learningStore.all('attempts'), learningStore.all('drafts')]);
      const attempts = device.status === 'fulfilled' ? device.value : [], saved = unfinished.status === 'fulfilled' ? unfinished.value : [];
      if (!active) return;
      if (device.status === 'rejected' || unfinished.status === 'rejected') setError('Some device records could not load. Account records are shown when available.');
      const local = mergeLearningRecords({ attempts, ownerId: user?.id });
      setRecords(previous => [...new Map([...previous, ...local].map(record => [record.id, record])).values()].sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0)));
      const examDrafts = saved.filter(draft => draft.id.startsWith(`exam:${user?.id || 'guest'}:`)).map(draft => {
        const task = getSpeakingTask(draft.taskId);
        return { id: draft.id, title: task?.title || 'Exam practice', href: task ? examPath(task, { questionIndex: draft.question == null ? null : Number(draft.question), parentId: draft.parentId, focus: draft.focus, part: draft.part, session: draft.attemptId, stage: 'practice' }) : '/exam' };
      });
      const dailyDrafts = [];
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (!key?.startsWith(`speaknow-voice-draft:${user?.id || 'guest'}:`)) continue;
        try { const draft = JSON.parse(localStorage.getItem(key)); if (draft.href && (draft.draft || draft.messages?.some(turn => turn.role === 'user'))) dailyDrafts.push({ id: key, title: draft.title || 'Daily Conversation', href: draft.href }); } catch { /* Preserve invalid originals. */ }
      }
      setDrafts(previous => [...(unfinished.status === 'fulfilled' ? examDrafts : previous.filter(draft => draft.id.startsWith('exam:'))), ...dailyDrafts]);
      if (user) {
        const remote = await apiJson('/api/learning-dashboard', { action: 'records' }, { signal: controller.signal });
        if (active) { setRecords(mergeLearningRecords({ attempts, ...remote, ownerId: user.id })); setDetailedInsights(remote.detailedInsights); }
      } else {
        const access = await apiJson('/api/membership', { action: 'status' }, { signal: controller.signal });
        if (active) setDetailedInsights(access.detailedInsights);
      }
    })().catch(e => active && setError(`Some records could not refresh: ${e.message}. Available saved records remain shown.`)).finally(() => active && setLoading(false));
    return () => { active = false; controller.abort(); };
  }, [user?.id, revision]);
  const insights = useMemo(() => learningInsights(records), [records]);
  return { records, drafts, loading, error, detailedInsights, insights, refresh: () => setRevision(value => value + 1) };
}
