import { useEffect, useRef, useState } from 'react';
import { subscribeActivitySync } from '@/lib/activitySync';
import { createLatestResource } from '@/lib/latestResource';

// Both existing history pages have exactly the same list/reload lifecycle.
export function useSessionHistory(entity) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const resource = useRef(null);
  useEffect(() => {
    const reader = createLatestResource({
      load: () => entity.list('-created_date', 50),
      onStart: () => setLoading(true),
      onValue: data => { setSessions(data || []); setLoadError(''); },
      onError: () => setLoadError('Your saved sessions could not be loaded. Existing records are kept; try again.'),
      onEnd: () => setLoading(false),
    });
    resource.current = reader;
    void reader.refresh();
    const unsubscribe = subscribeActivitySync(() => void reader.refresh());
    return () => { reader.dispose(); unsubscribe(); if (resource.current === reader) resource.current = null; };
  }, [entity]);
  return { sessions, setSessions: update => { if (resource.current) setSessions(update); }, loading, loadError, loadSessions: () => resource.current?.refresh() };
}
