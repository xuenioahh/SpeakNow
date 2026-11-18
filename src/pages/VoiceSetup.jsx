import { Navigate, useLocation } from 'react-router-dom';
import { getScenario } from '@/lib/scenarios';

// Earlier bookmarks enter the same Guidance flow as the scene picker.
export default function VoiceSetup() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  if (['toefl', 'ielts'].includes(params.get('scoring'))) return <Navigate to="/exam" replace />;
  if (!getScenario(params.get('scenario'))) return <Navigate to="/voice" replace />;
  params.set('mode', params.get('mode') === 'advanced' ? 'advanced' : 'basic');
  return <Navigate to={`/voice/prepare?${params}`} replace />;
}
