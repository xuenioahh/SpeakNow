import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import api, { resolveApiRoute } from '../../server/api.js';

const response = () => ({ code: 200, headers: {}, status(code) { this.code = code; return this; }, setHeader(key, value) { this.headers[key] = value; }, json(value) { this.value = value; }, end() { this.ended = true; } });
test('every existing public API is allowlisted while private modules and traversal are rejected', async () => {
  const files = await fs.readdir('api');
  for (const file of files.filter(name => name.endsWith('.js') && !name.startsWith('_'))) assert.equal(resolveApiRoute(`/api/${file}`).name, file.slice(0, -3));
  for (const path of ['/api/_auth', '/api/../api/_securityStore', '/api/%2e%2e/_auth', '/api/__proto__', '/api/voice-chat/other', '/api/missing']) assert.equal(resolveApiRoute(path), null);
});
test('rewritten requests keep the original API identity and user query without internal routing parameters', () => {
  assert.deepEqual(resolveApiRoute('/server/api.js?__speaknow_route=speaking-feedback&page=2'), { name: 'speaking-feedback', url: '/api/speaking-feedback?page=2', query: { page: '2' } });
  assert.equal(resolveApiRoute('/api/voice-chat?__speaknow_route=admin-track').name, 'voice-chat');
});
test('consolidated routing still executes original authentication and public capabilities handlers', async () => {
  const unauthorized = response();
  await api({ url: '/api/presentation-practice', method: 'POST', headers: {}, body: {} }, unauthorized);
  assert.equal(unauthorized.code, 401);
  const publicStatus = response();
  await api({ url: '/server/api.js?__speaknow_route=voice-capabilities', method: 'GET', headers: {} }, publicStatus);
  assert.equal(publicStatus.code, 200);
  assert.ok(['browser', 'elevenlabs'].includes(publicStatus.value.dynamicTts));
});
