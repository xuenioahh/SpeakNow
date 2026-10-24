import { validateAttempt } from '../../shared/speakingTasks';
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
export async function saveAttempt(attempt) {
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
    if (parent && !parent.cloudSaved) await cloudAttempt(parent, ownerId);
  }
  const remote = await apiJson('/api/speaking-practice', {
    action: 'save',
    attempt
  });
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
    feedbackCloudSaved: Boolean(remote.feedback),
    cloudSaved: true
  };
  await saveAttempt(result);
  return result;
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
  await learningStore.remove('attempts', attempt.id);
}
