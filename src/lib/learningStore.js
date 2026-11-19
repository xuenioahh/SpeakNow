import { validateAttempt, registerTaskSnapshot } from '../../shared/speakingTasks';
import { apiJson } from '@/api/http';
const DATABASE = 'speaknow-learning-v1';
function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      for (const name of ['attempts', 'recordings', 'drafts']) request.result.createObjectStore(name, {
        keyPath: 'id'
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Device storage is unavailable. Keep this page open and retry.'));
  });
}
async function transact(store, mode, operation) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = operation(tx.objectStore(store));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(new Error('Could not save on this device. Storage may be full.'));
    };
  });
}
export const learningStore = {
  put: (store, value) => transact(store, 'readwrite', s => s.put(value)),
  get: (store, id) => transact(store, 'readonly', s => s.get(id)),
  all: store => transact(store, 'readonly', s => s.getAll()),
  remove: (store, id) => transact(store, 'readwrite', s => s.delete(id))
};
export async function discardPracticeDraft(draftKey, extraRecordingIds = []) {
  const draft = await learningStore.get('drafts', draftKey);
  const recordings = value => [value?.recordingId, ...(value?.recordingIds || []), ...(value?.answers || []).map(answer => answer.recordingId)].filter(Boolean);
  const candidates = new Set([...recordings(draft), ...extraRecordingIds].filter(Boolean));
  const others = [...await learningStore.all('attempts'), ...(await learningStore.all('drafts')).filter(value => value.id !== draftKey)];
  const shared = new Set(others.flatMap(recordings));
  for (const id of candidates) if (!shared.has(id)) await learningStore.remove('recordings', id);
  await learningStore.remove('drafts', draftKey);
}
export async function saveAttempt(attempt) {
  if (attempt.taskSnapshot) registerTaskSnapshot(attempt.taskSnapshot);
  const validated = validateAttempt(attempt);
  const value = {
    ...attempt,
    ...validated,
    taskSnapshot: attempt.taskSnapshot || validated.taskSnapshot,
    taskSource: attempt.taskSource || validated.taskSource,
    taskVersion: attempt.taskVersion || validated.taskVersion
  };
  await learningStore.put('attempts', value);
  return value;
}
const attemptWrites = new Map();
export function updateAttempt(id, update) {
  const job = (attemptWrites.get(id) || Promise.resolve()).catch(() => {}).then(async () => {
    const latest = await learningStore.get('attempts', id);
    if (!latest) return null;
    return saveAttempt(update(latest));
  });
  attemptWrites.set(id, job);
  job.finally(() => { if (attemptWrites.get(id) === job) attemptWrites.delete(id); }).catch(() => {});
  return job;
}
export function practicePayload(attempt) {
  const { audioAssessments: _audioAssessments, feedbackRequest: _feedbackRequest, ...value } = attempt;
  return value;
}
export function accountSavedAttempt(remote, ownerId) {
  validateAttempt(remote);
  const cloud = ['supabase', 'mongodb'].includes(remote.storageMode);
  return { ...remote, ownerId, accountSaved: true, cloudSaved: cloud,
    storageMode: remote.storageMode || 'unverified', feedbackAccountSaved: Boolean(remote.feedback), feedbackCloudSaved: cloud && Boolean(remote.feedback) };
}
export async function cloudAttempt(attempt, ownerId) {
  if (attempt.ownerId && attempt.ownerId !== ownerId) throw new Error('This practice belongs to another account.');
  // Claim before network writes so a later account can never inherit a failed sync.
  attempt = {
    ...attempt,
    ownerId
  };
  await saveAttempt(attempt);
  if (attempt.parentId) {
    const parent = await learningStore.get('attempts', attempt.parentId);
    if (parent && !parent.accountSaved && !parent.cloudSaved) await cloudAttempt(parent, ownerId);
  }
  const remoteAttempt = attempt.track === 'daily' ? { ...attempt, visualEvidence: null, videoClip: null, liveMetrics: null,visionTimeline:null } : attempt;
  const remote = await apiJson('/api/speaking-practice', {
    action: 'save',
    attempt: practicePayload(remoteAttempt)
  });
  validateAttempt(remote);
  if (remote.id !== attempt.id) throw new Error('The server returned a different practice. Your local copy is kept; retry saving.');
  for (const answer of attempt.answers) {
    if (!answer.recordingId) continue;
    const recording = await learningStore.get('recordings', answer.recordingId);
    if (!recording?.blob) continue; // A remotely loaded attempt already has its cloud media.
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('Could not read recording'));
      reader.readAsDataURL(recording.blob);
    });
    await apiJson('/api/speaking-practice', {
      action: 'upload',
      id: attempt.id,
      recordingId: answer.recordingId,
      mime: recording.blob.type,
      data
    });
  }
  const result = {
    ...attempt,
    taskSnapshot: remote.taskSnapshot,
    taskSource: remote.taskSource,
    taskVersion: remote.taskVersion,
    feedback: remote.feedback || attempt.feedback,
    audioAssessments: { ...attempt.audioAssessments, ...remote.audioAssessments },
    storageMode: remote.storageMode || 'unverified',
    feedbackAccountSaved: Boolean(remote.feedback),
    feedbackCloudSaved: ['supabase', 'mongodb'].includes(remote.storageMode) && Boolean(remote.feedback),
    accountSaved: true,
    cloudSaved: ['supabase', 'mongodb'].includes(remote.storageMode)
  };
  // Audio checks can finish while the account upload is in flight.
  return await updateAttempt(attempt.id, latest => ({ ...latest, ...result,
    feedback: result.feedback || latest.feedback,
    feedbackAccountSaved: result.feedbackAccountSaved || latest.feedbackAccountSaved,
    feedbackCloudSaved: result.cloudSaved && (result.feedbackCloudSaved || latest.feedbackCloudSaved),
    audioAssessments: { ...result.audioAssessments, ...latest.audioAssessments }
  })) || result;
}
export async function recordingBlob(attempt, recordingId) {
  const local = await learningStore.get('recordings', recordingId);
  if (local?.blob) return local.blob;
  const value = await apiJson('/api/speaking-practice', {
    action: 'media',
    id: attempt.id,
    recordingId
  });
  return new Blob([Uint8Array.from(atob(value.data), c => c.charCodeAt(0))], {
    type: value.mime
  });
}

export async function deleteAttempt(attempt, ownerId) {
  if (attempt.ownerId && attempt.ownerId !== ownerId) throw new Error('Sign in to the account that owns this practice before deleting it.');
  const records = await learningStore.all('attempts');
  if (records.some(record => record.parentId === attempt.id)) throw new Error('Delete linked retries first to preserve their comparison history.');
  // An interrupted sync may have reached the server even when cloudSaved is false.
  if (attempt.ownerId) {
    try { await apiJson('/api/speaking-practice', { action: 'delete', id: attempt.id }); }
    catch (error) { if (error.status !== 404) throw error; }
  }
  for (const answer of attempt.answers) {
    if (answer.recordingId && !records.some(record => record.id !== attempt.id && record.answers.some(a => a.recordingId === answer.recordingId))) await learningStore.remove('recordings', answer.recordingId);
  }
  if (attempt.videoClip?.id) await learningStore.remove('recordings', attempt.videoClip.id);
  await learningStore.remove('attempts', attempt.id);
}
