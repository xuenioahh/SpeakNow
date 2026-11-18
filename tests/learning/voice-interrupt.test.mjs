import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceInteraction } from '../../src/lib/voice/VoiceInteraction.js';

test('starting the microphone aborts an obsolete AI turn and keeps the user words', async () => {
  let signal, starts = 0;
  const session = new VoiceInteraction({
    audio: { subscribe: () => () => {}, stop() {} },
    request: async (_text, options) => { signal = options.signal; return new Promise(() => {}); },
    environment: { setTimeout, clearTimeout, setInterval, clearInterval, navigator: { mediaDevices: {} } },
  });
  session.capture.start = async () => { starts++; return true; };
  session.setTypedText('Please make it iced.');
  await session.send();
  await Promise.resolve();
  assert.equal(session.getSnapshot().status, 'processing');
  assert.equal(await session.startRecording(), true);
  assert.equal(signal.aborted, true);
  assert.equal(starts, 1);
  assert.equal(session.getSnapshot().messages.filter(item => item.role === 'user')[0].content, 'Please make it iced.');
  session.dispose();
});
