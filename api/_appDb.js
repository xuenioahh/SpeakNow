import { readJson, mutateJson } from './_jsonStore.js';
const EMPTY = { users: [], voiceSessions: [], presentationSessions: [], activityRecords: [], settings: { adminEmails: [] } };
function validate(db) {
  if (!db || ['users', 'voiceSessions', 'presentationSessions', 'activityRecords'].some(key => !Array.isArray(db[key])) || !db.settings) throw Object.assign(new Error('Stored app data is malformed. Original data was preserved.'), { status: 503 });
  return db;
}
export async function readAppDb() { return validate(await readJson('app-db.json', EMPTY)); }
export async function writeAppDb(db) { return mutateJson('app-db.json', EMPTY, () => validate(db)); }
export async function mutateAppDb(mutator) { return mutateJson('app-db.json', EMPTY, async db => validate(await mutator(validate(db)) || db)); }
