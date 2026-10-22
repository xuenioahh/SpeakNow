// Unsent work is device-local and scoped to the authenticated user and attempt.
let database;
function open() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('speaknow-unsent-presentations', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = null; reject(new Error('This browser cannot preserve an unsent recording.')); };
  });
  return database;
}
async function transaction(userId, attemptId, mode, operate) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', mode), store = tx.objectStore('drafts');
    const request = operate(store, `${userId}:${attemptId}`);
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(new Error('The unsent presentation could not be preserved on this device.'));
  });
}
export function readDraft(userId, attemptId) { return transaction(userId, attemptId, 'readonly', (store, key) => store.get(key)); }
export function writeDraft(userId, attemptId, value) { return transaction(userId, attemptId, 'readwrite', (store, key) => store.put({ ...value, key, updatedAt: new Date().toISOString() })); }
export function removeDraft(userId, attemptId) { return transaction(userId, attemptId, 'readwrite', (store, key) => store.delete(key)); }
