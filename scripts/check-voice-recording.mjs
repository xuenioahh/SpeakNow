// Ownership/lifecycle checks migrated to the shared store and capture controller.
import './check-voice-interaction.mjs';
import { VoiceInteraction } from '../src/lib/voice/VoiceInteraction.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const previousWindow = globalThis.window;
globalThis.window = { self: globalThis, top: globalThis };
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'speaknow-controls-'));
try {
  fs.writeFileSync(path.join(temporary, 'package.json'), '{"type":"module"}');
  fs.symlinkSync(path.join(project, 'node_modules'), path.join(temporary, 'node_modules'));
  await build({ entryPoints: [path.join(project, 'src/components/voice/RecordingControls.jsx')], bundle: true, packages: 'external', platform: 'node', format: 'esm', outfile: path.join(temporary, 'controls.js'), alias: { '@': path.join(project, 'src') }, jsx: 'automatic' });
  const Controls = (await import(pathToFileURL(path.join(temporary, 'controls.js')).href)).default;
  const require = createRequire(path.join(project, 'package.json'));
  const React = require('react'); const { renderToStaticMarkup } = require('react-dom/server');
  let action;
  const interaction = Object.fromEntries(['startRecording', 'stopRecording', 'cancelRecording', 'send', 'cancelRequest', 'retryRequest', 'configure'].map(name => [name, () => { action = name; }]));
  const initial = { status: 'idle', inputActive: false, recordingSession: false, finalText: '', interimText: '', typedText: '', autoEnd: false, autoPlay: true, energyAvailable: false, retryable: false };
  const button = (element, label) => {
    if (!element || typeof element !== 'object') return null;
    if (element.type === 'button' && element.props['aria-label'] === label) return element;
    for (const child of React.Children.toArray(element.props?.children)) { const found = button(child, label); if (found) return found; }
    return null;
  };
  const render = patch => Controls({ interaction, state: { ...initial, ...patch } });
  button(render(), 'Start recording').props.onClick(); assert.equal(action, 'startRecording');
  button(render({ status: 'requesting_permission' }), 'Cancel microphone startup').props.onClick(); assert.equal(action, 'cancelRecording');
  const active = render({ status: 'listening', inputActive: true, recordingSession: true, finalText: 'Confirmed', interimText: 'still provisional' });
  const stop = button(active, 'Stop recording and send'); assert.equal(stop.props['aria-pressed'], true); stop.props.onClick(); assert.equal(action, 'stopRecording');
  assert.equal(button(active, 'Send reply').props.disabled, true);
  assert.equal(button(render({ status: 'processing' }), 'Start recording').props.disabled, true);
  const reviewed = render({ status: 'error', typedText: 'Reviewed complete words', error: 'Reconnect and retry.' });
  assert.equal(button(reviewed, 'Send reply').props.disabled, false); button(reviewed, 'Send reply').props.onClick(); assert.equal(action, 'send');
  const markup = renderToStaticMarkup(active);
  assert(markup.includes('voice-final-words') && markup.includes('Confirmed'));
  assert(markup.includes('voice-interim-words') && markup.includes('still provisional'));
  assert(markup.includes('Live transcription'));
  console.log('PASS: actual React controls, single-store action delegation, permission cancellation, stop/send locks and real interim/final caption markup');
  await build({ entryPoints: [path.join(project, 'src/api/localClient.js')], bundle: true, packages: 'external', platform: 'node', format: 'esm', outfile: path.join(temporary, 'client.js'), alias: { '@': path.join(project, 'src') } });
  const { localApi } = await import(pathToFileURL(path.join(temporary, 'client.js')).href);
  const previousFetch = globalThis.fetch;
  const previousDocument = globalThis.document;
  globalThis.document = { cookie: 'speaknow_csrf=transport-fixture' };
  let fetchAborted = false;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/api/voice-chat');
      assert.equal(options.credentials, 'same-origin');
      assert.equal(options.headers['x-csrf-token'], 'transport-fixture');
      const payload = JSON.parse(options.body);
      assert.equal(payload.kind, 'voice-chat');
      assert.equal(payload.userText, 'Transport cancellation must reach fetch');
      return new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => { fetchAborted = true; reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); }, { once: true });
      });
    };
    const session = new VoiceInteraction({ audio: { subscribe: () => () => {} }, request: (text, { history, signal }) => localApi.integrations.Core.InvokeLLM({ input: { kind: 'voice-chat', userText: text, history } }, { signal }) });
    session.activate(); session.setTypedText('Transport cancellation must reach fetch');
    await session.send(); session.cancelRequest(); await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(fetchAborted, true); assert.equal(session.getSnapshot().status, 'idle');
    assert.equal(session.getSnapshot().messages.filter(message => message.role === 'ai').length, 0);
    session.dispose();
    console.log('PASS: shared turn cancellation reaches the actual localApi fetch transport without adding a stale reply');
  } finally { globalThis.fetch = previousFetch; globalThis.document = previousDocument; }

} finally { globalThis.window = previousWindow; fs.rmSync(temporary, { recursive: true, force: true }); }
