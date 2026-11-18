import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceInteraction } from '../../src/lib/voice/VoiceInteraction.js';
import { SCENARIOS } from '../../src/lib/scenarios.js';
import { getDailyTasks } from '../../src/lib/dailyTasks.js';

test('NPC opening finishes before microphone capture, using the existing voice state machine', async () => {
  const order = [], listeners = new Set();
  const audio = { subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }, stop() {},
    async playAIVoice(text, _gender, options) {
      order.push(`speak:${text}`);
      listeners.forEach(listener => listener({ type: 'start', playbackId: options.playbackId, text, provider: 'browser' }));
      await new Promise(resolve => setImmediate(resolve)); order.push('speech-ended');
      listeners.forEach(listener => listener({ type: 'end', playbackId: options.playbackId, reason: 'ended' })); return true;
    } };
  const session = new VoiceInteraction({ audio, initialMessage: { id: 'opening', role: 'ai', source: 'scenario', content: 'Hello. What can I get for you?' } });
  session.capture.start = async () => { order.push('microphone'); return true; };
  assert.equal(await session.startContinuous(), true);
  assert.deepEqual(order, ['speak:Hello. What can I get for you?', 'speech-ended', 'microphone']);
  assert.ok(session.getSnapshot().messages[0].endedAt);
  session.dispose();
});
test('each existing daily scene has a usable opening and restarting an existing conversation preserves its history', async () => {
  for (const scenario of SCENARIOS) for (const task of getDailyTasks(scenario)) assert.ok(task.conversation.firstMessage.trim());
  const session = new VoiceInteraction({ initialMessages: [{ id: 'opening', role: 'ai', content: 'Hello.' }, { id: 'user-turn-1', role: 'user', content: 'A saved answer.' }, { id: 'ai-turn-1', role: 'ai', content: 'A saved response.' }] });
  let captures = 0; session.capture.start = async () => { captures++; return true; };
  await session.startContinuous(); assert.equal(captures, 1); assert.equal(session.getSnapshot().messages.length, 3); session.dispose();
});
