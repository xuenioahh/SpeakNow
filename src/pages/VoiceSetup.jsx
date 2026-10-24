import { Navigate, useLocation } from 'react-router-dom';
import { getScenario } from '@/lib/scenarios';

// Compatibility entry for earlier bookmarks; the scenario picker now owns setup.
export default function VoiceSetup() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  if (['toefl', 'ielts'].includes(params.get('scoring'))) return <Navigate to="/exam" replace />;
  if (!getScenario(params.get('scenario'))) return <Navigate to="/voice" replace />;
  params.set('mode', params.get('mode') === 'advanced' ? 'advanced' : 'basic');
  params.set('dialogMode', params.get('dialogMode') === 'free_talk' ? 'free_talk' : 'goal_oriented');
  params.set('scoring', 'daily');
  return <Navigate to={`/voice/chat?${params}`} replace />;
}
