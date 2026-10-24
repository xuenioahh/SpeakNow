import { build } from 'esbuild';
import { cp } from 'node:fs/promises';

// MediaPipe's WASM loader calls importScripts; it needs a classic Worker.
export async function buildExpressionWorker() {
  // Reuse the installed package assets; avoid a second CDN dependency at runtime.
  await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/expression-vision', { recursive: true });
  await build({
    entryPoints: ['src/lib/expressionVision.worker.js'],
    outfile: 'public/expression-worker.js', bundle: true, format: 'iife',
    platform: 'browser', target: 'es2020', minify: true, legalComments: 'inline',
  });
}
