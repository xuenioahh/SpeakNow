import test from 'node:test';
import assert from 'node:assert/strict';
import { startVisionSession } from '../../src/lib/expressionVisionSession.js';

test('repeated frame capture failures stop analysis and report unavailable', async () => {
  const originals = Object.fromEntries(['Worker','setInterval','clearInterval','setTimeout','clearTimeout','createImageBitmap'].map(key => [key, globalThis[key]]));
  let worker, tick, stopped = false;
  const states = [];
  try {
    globalThis.Worker = class { constructor() { worker = this; } postMessage() {} terminate() { stopped = true; } };
    globalThis.setInterval = callback => { tick = callback; return 1; };
    globalThis.clearInterval = () => {};
    globalThis.setTimeout = () => 1;
    globalThis.clearTimeout = () => {};
    globalThis.createImageBitmap = async () => { throw new Error('Video frames unavailable'); };
    const stop = startVisionSession({readyState:2}, {onSample:() => assert.fail('No sample should be invented'), onStatus:state => states.push(state)});
    worker.onmessage({data:{type:'ready'}});
    for (let index=0; index<3; index++) await tick();
    assert.equal(states.at(-1), 'unavailable');
    assert.equal(stopped, true);
    stop();
  } finally { Object.assign(globalThis, originals); }
});
