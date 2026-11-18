import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { fixedAudioCatalog } from '../../scripts/fixed-audio-catalog.mjs';

test('fixed audio inventory binds actual question and dialogue IDs to content hashes', () => {
  const entries = fixedAudioCatalog();
  assert.equal(entries.length, 675);
  assert.equal(new Set(entries.map(item => item.audioId)).size, entries.length);
  assert(entries.some(item => item.questionId?.startsWith('toefl-repeat-') && item.text.includes('painting class')));
  assert(entries.some(item => item.dialogueId === 'cafe:menu:opening'));
  assert(entries.every(item => /^[0-9a-f]{64}$/.test(item.textHash)));
});

test('saved audio resolves only ready entries with matching text and safe versioned URL', async () => {
  globalThis.crypto ||= webcrypto;
  const originalFetch = globalThis.fetch;
  const item = fixedAudioCatalog()[0];
  const base = { audioId: item.audioId, questionId: item.questionId, textHash: item.textHash, provider: 'elevenlabs', model: 'eleven_flash_v2_5', voiceId: 'reviewed-voice', duration: 2.5, generationStatus: 'ready', version: 1, audioUrl: `/fixed-audio/v1/${item.audioId}.mp3` };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ version: 1, entries: [base, { ...base, audioId: 'unsafe', audioUrl: 'https://outside.example/audio.mp3' }] }) });
  try {
    const { savedFixedAudio } = await import('../../src/lib/fixedAudioLibrary.js');
    assert.equal((await savedFixedAudio(item.audioId, item.text))?.audioUrl, base.audioUrl);
    assert.equal(await savedFixedAudio(item.audioId, `${item.text} changed`), null);
    assert.equal(await savedFixedAudio('unsafe', item.text), null);
    assert.equal(await savedFixedAudio('missing', item.text), null);
  } finally { globalThis.fetch = originalFetch; }
});
