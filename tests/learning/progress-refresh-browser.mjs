import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
const { chromium } = await import('/Users/zhangzhuoru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const bundle = await build({
  stdin: { contents: `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import { useLearningRecords } from './src/hooks/useLearningRecords.js';
    window.owner = { id: 'first' }; window.pending = []; window.storageFails = false;
    function App() { window.result = useLearningRecords(); return null; }
    const root = createRoot(document.getElementById('root'));
    window.render = () => root.render(React.createElement(App)); window.render();
  `, resolveDir: process.cwd(), loader: 'jsx' },
  bundle: true, write: false, format: 'iife', plugins: [{ name: 'fixtures', setup(b) {
    b.onResolve({ filter: /^@\// }, args => {
      const mocks = ['@/lib/AuthContext', '@/lib/learningStore', '@/api/http'];
      return mocks.includes(args.path) ? { path: args.path, namespace: 'mock' } : { path: `${process.cwd()}/src/${args.path.slice(2)}.js` };
    });
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents:
      args.path.endsWith('AuthContext') ? 'export const useAuth = () => ({user: window.owner});' :
      args.path.endsWith('learningStore') ? `export const learningStore = { all: async name => {
        if (window.storageFails) throw Error('unavailable');
        return name === 'drafts' ? [{id: 'exam:' + window.owner.id + ':one', taskId: 'unknown'}] : [];
      } };` :
      'export const apiJson = (url, body, options) => new Promise((resolve, reject) => window.pending.push({resolve, reject, signal: options.signal}));'
    }));
  } }],
});
const browser = await chromium.launch({channel:'chrome', headless:true});
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('http://progress.test/', route => route.fulfill({contentType:'text/html', body:'<div id="root"></div>'}));
  await page.goto('http://progress.test/');
  await page.addScriptTag({content: bundle.outputFiles[0].text});
  await page.waitForFunction(() => window.pending.length === 1);
  await page.evaluate(() => window.pending[0].resolve({detailedInsights:true}));
  await page.waitForFunction(() => window.result.detailedInsights && !window.result.loading);
  await page.evaluate(() => { window.result.refresh(); });
  await page.waitForFunction(() => window.pending.length === 2);
  await page.evaluate(() => { window.owner = {id:'second'}; window.render(); });
  await page.waitForFunction(() => window.pending.length === 3);
  assert.equal(await page.evaluate(() => window.pending[1].signal.aborted), true);
  assert.equal(await page.evaluate(() => window.result.detailedInsights), false);
  await page.evaluate(() => window.pending[1].reject(Error('old account failure')));
  assert.equal(await page.evaluate(() => window.result.error), '');
  await page.evaluate(() => window.pending[2].resolve({detailedInsights:false}));
  await page.waitForFunction(() => !window.result.loading);
  assert.equal(await page.evaluate(() => window.result.drafts[0].id), 'exam:second:one');
  await page.evaluate(() => { window.storageFails = true; window.result.refresh(); });
  await page.waitForFunction(() => window.pending.length === 4);
  assert.equal(await page.evaluate(() => window.result.drafts[0].id), 'exam:second:one');
  await page.evaluate(() => window.pending[3].resolve({detailedInsights:false}));
  await page.waitForFunction(() => !window.result.loading);
  assert.match(await page.evaluate(() => window.result.error), /device records/);
  assert.deepEqual(errors, []);
  const result = {passed: ['obsolete account request cancelled', 'account insights reset', 'obsolete failure ignored', 'draft preserved during device storage failure'], pageErrors:errors};
  await fs.writeFile('docs/optimization-2026-11-08/browser.json', JSON.stringify(result,null,2));
  console.log(result);
} finally { await browser.close(); }
