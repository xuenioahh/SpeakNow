import { apiJson } from '@/api/http';
export async function getPractice(id) { return (await apiJson('/api/presentation-practice', { action: 'get', id })).session; }
export async function readImpact(id) { return (await getPractice(id)).report.impact; }
export async function listLinkedPractices(id) {
  const { sessions } = await apiJson('/api/presentation-practice', { action: 'linked', id });
  return sessions.map(session => ({ ...session.report.impact, practiceId: session.id }));
}
export async function savePractice(practice) { return (await apiJson('/api/presentation-practice', { action: 'save', ...practice })).session; }
export async function saveRecording(sessionId, blob, recordingId = undefined) {
  const mime = blob.type.split(';')[0] || 'audio/webm';
  const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Recording could not be read')); reader.readAsDataURL(new Blob([blob], { type: mime })); });
  return apiJson('/api/presentation-media', { action: 'save', sessionId, dataUrl, recordingId });
}
export async function readRecording(id) {
  const [sessionId, recordingId] = id.split(':');
  const { dataUrl } = await apiJson('/api/presentation-media', { action: 'read', sessionId, recordingId });
  return (await fetch(dataUrl)).blob();
}
