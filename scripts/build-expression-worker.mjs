import { build } from 'esbuild';

// MediaPipe's WASM loader calls importScripts; it needs a classic Worker.
export async function buildExpressionWorker() {
  await build({
    entryPoints: ['src/lib/expressionVision.worker.js'],
    outfile: 'public/expression-worker.js', bundle: true, format: 'iife',
    platform: 'browser', target: 'es2020', minify: true, legalComments: 'inline',
  });
}
