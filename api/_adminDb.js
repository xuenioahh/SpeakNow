import { readJson, mutateJson } from './_jsonStore.js';

const EMPTY = { users: [], events: [], voiceSessions: [], presentationSessions: [] };
function validate(db) {
  if (!db || Object.keys(EMPTY).some(key => !Array.isArray(db[key]))) {
    throw Object.assign(new Error('Stored admin data is malformed. Original data was preserved.'), { status: 503 });
  }
  return db;
}
export async function readAdminDb() { return validate(await readJson('admin-db.json', EMPTY)); }
export async function writeAdminDb(db) { return mutateJson('admin-db.json', EMPTY, () => validate(db)); }
export async function mutateAdminDb(mutator) {
  return mutateJson('admin-db.json', EMPTY, async db => validate(await mutator(validate(db)) || db));
}
