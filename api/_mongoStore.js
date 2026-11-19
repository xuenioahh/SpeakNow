import { MongoClient, Binary } from 'mongodb';
import { randomUUID } from 'node:crypto';

const primaryKeys = {
  app_users: 'id', app_voice_sessions: 'id', app_presentation_sessions: 'id',
  app_activity_records: 'id', app_settings: 'key', app_auth_sessions: 'id',
  app_usage_counters: 'key', app_api_usage: 'id', app_memberships: 'user_id',
  app_usage_ledgers: 'user_id', admin_users: 'id', admin_events: 'id',
  admin_voice_sessions: 'id', admin_presentation_sessions: 'id',
};
let connection;
let connectionKey;
let client;
const unavailable = () => Object.assign(new Error('Persistent storage is temporarily unavailable. Please retry.'), { status: 503, code: 'storage_unavailable', retryable: true });
const invalid = () => Object.assign(new Error('Invalid storage request.'), { status: 400, code: 'invalid_storage_request' });
const conflict = () => Object.assign(new Error('This record already exists.'), { status: 409, code: 'record_conflict' });

function configuration(env) {
  if (!/^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI || '') || !/^[a-zA-Z0-9_-]{1,63}$/.test(env.MONGODB_DB || '')) throw unavailable();
  if (['admin', 'local', 'config'].includes(env.MONGODB_DB)) throw unavailable();
  return { uri: env.MONGODB_URI, name: env.MONGODB_DB };
}

async function initialize(db) {
  // Create indexes once per warm server instance, before accepting any writes.
  // Deterministic _id values enforce every former SQL primary key atomically.
  await Promise.all(Object.keys(primaryKeys).map(name => db.collection(name).createIndex({ [primaryKeys[name]]: 1 }, { unique: true })));
  await Promise.all([
    db.collection('app_users').createIndex({ email: 1 }, { unique: true }),
    db.collection('admin_users').createIndex({ email: 1 }, { unique: true }),
    ...['app_voice_sessions', 'app_presentation_sessions', 'app_activity_records', 'app_api_usage'].map(name => db.collection(name).createIndex({ user_id: 1, created_date: -1 })),
    db.collection('app_auth_sessions').createIndex({ _expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('app_usage_counters').createIndex({ until_at: 1 }, { expireAfterSeconds: 0 }),
    db.collection('speaknow_recordings').createIndex({ created_date: -1 }),
    db.collection('speaknow_deployment_checks').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
  ]);
  return db;
}

export async function getMongoDb(env = process.env) {
  const { uri, name } = configuration(env);
  const key = `${uri}\n${name}`;
  if (connection && connectionKey !== key) await closeMongo();
  if (!connection) {
    connectionKey = key;
    client = new MongoClient(uri, { maxPoolSize: 10, minPoolSize: 0, maxIdleTimeMS: 60000,
      serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000, socketTimeoutMS: 20000,
      waitQueueTimeoutMS: 10000, retryWrites: true });
    const current = client;
    connection = current.connect().then(() => initialize(current.db(name))).catch(async () => {
      await current.close().catch(() => {});
      if (client === current) { connection = undefined; client = undefined; connectionKey = undefined; }
      throw unavailable();
    });
  }
  return connection;
}
export async function closeMongo() {
  const current = client;
  connection = undefined; client = undefined; connectionKey = undefined;
  if (current) await current.close();
}

const clean = doc => {
  if (!doc) return null;
  const { _id, _expiresAt, _impactRevision, ...value } = doc;
  return value;
};
const validField = value => /^[a-z][a-z0-9_]*$/.test(value);
function parseQuery(query) {
  const filter = {}, projection = { _id: 0 }, sort = {};
  let offset = 0, limit;
  for (const [key, value] of new URLSearchParams(query)) {
    if (key === 'select') {
      if (value !== '*') for (const field of value.split(',')) {
        if (!validField(field)) throw invalid();
        projection[field] = 1;
      }
    } else if (key === 'order') {
      for (const item of value.split(',')) {
        const [field, direction, extra] = item.split('.');
        if (!validField(field) || !['asc', 'desc'].includes(direction) || extra) throw invalid();
        sort[field] = direction === 'asc' ? 1 : -1;
      }
    } else if (key === 'limit' || key === 'offset') {
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw invalid();
      if (key === 'limit') limit = Number(value); else offset = Number(value);
    } else {
      if (!validField(key) || !value.startsWith('eq.')) throw invalid();
      filter[key] = value.slice(3); // Always a literal string, never an operator.
    }
  }
  return { filter, projection, sort, offset, limit };
}
function document(resource, body) {
  if (!body || Array.isArray(body) || typeof body !== 'object') throw invalid();
  for (const key of Object.keys(body)) if (!validField(key)) throw invalid();
  const id = body[primaryKeys[resource]];
  if (typeof id !== 'string' || !id || id.length > 1024) throw invalid();
  const row = { ...body, _id: id };
  if (resource === 'app_auth_sessions') {
    row._expiresAt = new Date(body.expires_at);
    if (!Number.isFinite(row._expiresAt.getTime())) throw invalid();
  }
  return row;
}
async function seed(collection, id, values) {
  try { await collection.updateOne({ _id: id }, { $setOnInsert: values }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
}

async function consumeLimit(db, body) {
  const { counter_key: key, counter_limit: limit, window_ms: window, increment_by: amount } = body;
  if (![limit, window, amount].every(Number.isSafeInteger) || limit <= 0 || window <= 0 || amount <= 0) return false;
  if (typeof key !== 'string' || !key) throw invalid();
  const collection = db.collection('app_usage_counters');
  const now = new Date(), until = new Date(now.getTime() + window);
  // Upsert may race with expiry cleanup; retry the entire initialization if the
  // TTL monitor removes the document between initialization and atomic update.
  for (let retry = 0; retry < 3; retry++) {
    await seed(collection, key, { key, count: 0, until_at: until });
    const row = await collection.findOneAndUpdate({ _id: key }, [
      { $set: { count: { $cond: [{ $lte: ['$until_at', now] }, 0, '$count'] }, until_at: { $cond: [{ $lte: ['$until_at', now] }, until, '$until_at'] } } },
      { $set: { _admitted: { $lte: [{ $add: ['$count', amount] }, limit] } } },
      { $set: { count: { $cond: ['$_admitted', { $add: ['$count', amount] }, '$count'] } } },
    ], { returnDocument: 'after', includeResultMetadata: false });
    if (row) return row._admitted === true;
  }
  throw unavailable();
}
async function commitUsage(db, body) {
  const { owner_id: owner, expected_revision: revision, next_state: state } = body;
  if (typeof owner !== 'string' || owner.length < 3 || !Number.isSafeInteger(revision) || revision < 0 || !state || typeof state !== 'object' || Array.isArray(state)) throw invalid();
  const collection = db.collection('app_usage_ledgers');
  await seed(collection, owner, { user_id: owner, revision: 0, state: { sessions: {}, operations: {}, measurements: [] } });
  const result = await collection.updateOne({ _id: owner, revision }, { $set: { state }, $inc: { revision: 1 } });
  return result.modifiedCount === 1;
}
async function updateImpact(db, { owner_id: owner, practice_id: id, operation, patch }) {
  if (typeof owner !== 'string' || typeof id !== 'string') throw invalid();
  const collection = db.collection('app_presentation_sessions');
  for (let retry = 0; retry < 20; retry++) {
    const row = await collection.findOne({ _id: id, user_id: owner });
    if (!row?.report?.impact) return null;
    const report = structuredClone(row.report), metadata = report.impact;
    if (operation === 'append') {
      if (!patch?.recording?.id) throw invalid();
      const existing = metadata.recordings.find(value => value.id === patch.recording.id);
      if (existing) {
        if (existing.mime !== patch.recording.mime || existing.bytes !== patch.recording.bytes) throw conflict();
        return clean(row);
      }
      if (metadata.recordings.length >= 20) throw Object.assign(new Error('Recording limit reached'), { status: 400 });
      metadata.recordings.push(patch.recording);
      metadata.recordingIds.push(`${id}:${patch.recording.id}`);
    } else if (operation === 'analysis') {
      if (metadata.analysis || metadata.comparison) return clean(row);
      Object.assign(metadata, patch); report.source = 'ai';
    } else throw invalid();
    const revisionFilter = row._impactRevision === undefined ? { $exists: false } : row._impactRevision;
    const result = await collection.findOneAndUpdate({ _id: id, user_id: owner, _impactRevision: revisionFilter },
      { $set: { report }, $inc: { _impactRevision: 1 } }, { returnDocument: 'after', includeResultMetadata: false });
    if (result) return clean(result);
  }
  throw unavailable();
}

// Adapter for the store's existing server-only query contract. No query string
// or RPC name from an HTTP client is forwarded directly into this function.
export async function mongoRequest(resource, { method = 'GET', body, query = '', prefer = '' } = {}) {
  try {
    if (!Object.hasOwn(primaryKeys, resource) && !['rpc/speaknow_consume_limit', 'rpc/speaknow_release_limit', 'rpc/speaknow_commit_usage', 'rpc/speaknow_update_impact'].includes(resource)) throw invalid();
    const db = await getMongoDb();
    if (resource.startsWith('rpc/')) {
      if (method !== 'POST' || !body) throw invalid();
      if (resource === 'rpc/speaknow_consume_limit') return await consumeLimit(db, body);
      if (resource === 'rpc/speaknow_commit_usage') return await commitUsage(db, body);
      if (resource === 'rpc/speaknow_update_impact') return await updateImpact(db, body);
      if (Number.isSafeInteger(body.decrement_by) && body.decrement_by > 0 && typeof body.counter_key === 'string') {
        await db.collection('app_usage_counters').updateOne({ _id: body.counter_key }, [{ $set: { count: { $max: [0, { $subtract: ['$count', body.decrement_by] }] } } }]);
      }
      return null;
    }
    const collection = db.collection(resource);
    const { filter, projection, sort, offset, limit } = parseQuery(query);
    if (method === 'GET') {
      if (limit === 0) return [];
      let cursor = collection.find(filter, { projection }).sort(sort).skip(offset);
      if (limit !== undefined) cursor = cursor.limit(limit);
      return (await cursor.toArray()).map(clean);
    }
    if (method === 'POST') {
      const rows = Array.isArray(body) ? body : [body], results = [];
      for (const item of rows) {
        const row = document(resource, item), { _id, ...value } = row;
        if (prefer.includes('resolution=merge-duplicates')) {
          const saved = await collection.findOneAndUpdate({ _id }, { $set: value }, { upsert: true, returnDocument: 'after', includeResultMetadata: false });
          results.push(clean(saved));
        } else { await collection.insertOne(row); results.push(clean(row)); }
      }
      return results;
    }
    if (!Object.keys(filter).length) throw invalid();
    if (method === 'DELETE') {
      await collection.deleteMany(filter);
      // Deleted accounts must immediately lose their existing sessions.
      if (resource === 'app_users' && filter.id) await db.collection('app_auth_sessions').deleteMany({ user_id: filter.id });
      return null;
    }
    if (method === 'PATCH') {
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !validField(key))) throw invalid();
      const key = primaryKeys[resource];
      if (body[key] !== undefined && body[key] !== filter[key]) throw invalid();
      const row = await collection.findOneAndUpdate(filter, { $set: body }, { returnDocument: 'after', includeResultMetadata: false });
      return row ? [clean(row)] : [];
    }
    throw invalid();
  } catch (error) {
    if ([400, 404, 409, 503].includes(error.status)) throw error;
    if (error.code === 11000) throw conflict();
    console.error('mongodb_request_failed', JSON.stringify({ resource, method, code: 'storage_unavailable' }));
    throw unavailable();
  }
}

export async function mongoMediaObject(key, { method = 'GET', data, mime } = {}) {
  try {
    if (!/^[\w-]+\/[\w-]+\/[\w-]+$/.test(key)) throw invalid();
    const collection = (await getMongoDb()).collection('speaknow_recordings');
    if (method === 'POST') {
      if (!data || data.byteLength > 10485760) throw Object.assign(new Error('Recording exceeds the 10 MB limit.'), { status: 400 });
      await collection.insertOne({ _id: key, data: new Binary(Buffer.from(data)), mime, created_date: new Date().toISOString() });
      return null;
    }
    if (method === 'DELETE') { await collection.deleteOne({ _id: key }); return null; }
    if (method !== 'GET') throw invalid();
    const row = await collection.findOne({ _id: key });
    if (!row) throw Object.assign(new Error('Recording not found.'), { status: 404 });
    return Buffer.from(row.data.value());
  } catch (error) {
    if ([400, 404, 409, 503].includes(error.status)) throw error;
    if (error.code === 11000) throw conflict();
    throw unavailable();
  }
}

export async function checkMongoHealth(env = process.env) {
  if (!env.MONGODB_URI || !env.MONGODB_DB) return { ok: false, provider: 'mongodb', checks: [{ resource: 'configuration', ok: false, code: 'missing_configuration' }] };
  const id = `preflight-${randomUUID()}`;
  let checksCollection;
  try {
    const db = await getMongoDb(env);
    await db.command({ ping: 1 });
    checksCollection = db.collection('speaknow_deployment_checks');
    // Verify durable read/write privileges with an isolated, expiring marker;
    // no real account, transcript, budget, or membership is touched.
    await checksCollection.insertOne({ _id: id, expires_at: new Date(Date.now() + 300000) });
    if (!await checksCollection.findOne({ _id: id })) throw unavailable();
    await checksCollection.deleteOne({ _id: id });
    return { ok: true, provider: 'mongodb', checks: [{ resource: 'connection', ok: true, code: 'ok' }, { resource: 'collections_and_indexes', ok: true, code: 'ok' }, { resource: 'read_write', ok: true, code: 'ok' }] };
  } catch {
    if (checksCollection) await checksCollection.deleteOne({ _id: id }).catch(() => {});
    return { ok: false, provider: 'mongodb', checks: [{ resource: 'database', ok: false, code: 'connection_or_permissions_failed' }] };
  }
}
