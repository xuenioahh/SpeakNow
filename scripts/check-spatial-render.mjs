import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Runtime React rendering assertions; these do not replace browser acceptance.
process.env.NODE_ENV = 'production';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'speaknow-spatial-render-'));
try {
  fs.writeFileSync(path.join(temporary, 'package.json'), JSON.stringify({ type: 'module' }));
  fs.symlinkSync(path.join(project, 'node_modules'), path.join(temporary, 'node_modules'));
  await build({ entryPoints: ['src/components/report/PracticeTimeline.jsx', 'src/components/report/RadarChart.jsx'].map(file => path.join(project, file)), bundle: true, platform: 'node', format: 'esm', packages: 'external', outdir: temporary, alias: { '@': path.join(project, 'src') }, jsx: 'automatic' });
  const require = createRequire(path.join(project, 'package.json'));
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { MemoryRouter } = require('react-router-dom');
  const Timeline = (await import(pathToFileURL(path.join(temporary, 'PracticeTimeline.js')).href)).default;
  const Radar = (await import(pathToFileURL(path.join(temporary, 'RadarChart.js')).href)).default;
  const sessions = [
    { id: 'actual-1', scenario: 'cafe', created_date: '2026-10-07T12:00:00Z', duration_seconds: 95 },
    { id: 'actual-2', kind: 'presentation', file_name: 'Actual rehearsal', created_date: '2026-10-08T12:00:00Z', duration_seconds: 120 },
    { id: 'invalid', created_date: 'invalid' },
    { scenario: 'no-id-record', created_date: '2026-10-09T12:00:00Z' },
  ];
  const markup = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Timeline, { sessions })));
  assert(markup.indexOf('Actual rehearsal') < markup.indexOf('Café'));
  assert(markup.includes('/presentation/history?session=actual-2'));
  assert(markup.includes('/voice/history?session=actual-1'));
  assert(!markup.includes('invalid')); assert(!markup.includes('no-id-record')); assert(markup.includes('Latest'));
  const radar = renderToStaticMarkup(React.createElement(Radar, { scores: { Fluency: 4.5, Grammar: 5 }, maxScore: 6 }));
  assert(radar.includes('Fluency: 4.5 out of 6'));
  assert(radar.includes('Grammar: 5 out of 6'));
  assert(radar.includes('Select a skill'));
  const partial = renderToStaticMarkup(React.createElement(Radar, { scores: { Fluency: null, Grammar: 0, Vocabulary: 12 }, maxScore: 9 }));
  assert(partial.includes('Fluency: not available'));
  assert(partial.includes('Grammar: 0 out of 9'));
  assert(partial.includes('Vocabulary: 12 out of 9'));
  assert(partial.includes('The chart needs complete scores'));
  assert(!partial.includes('NaN'));
  const empty = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Timeline, { sessions: [] })));
  assert.equal(empty, '');
  console.log('PASS: actual React rendering, exact score labels, chronological timeline, invalid/unlinked exclusion, empty state and real saved-record links');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
