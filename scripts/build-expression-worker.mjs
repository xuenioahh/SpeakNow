import { build } from 'esbuild';
import { cp, stat } from 'node:fs/promises';

// MediaPipe's WASM loader calls importScripts; it needs a classic Worker.
export async function buildExpressionWorker() {
  // Models are source assets; WASM and the Worker are rebuilt from dependencies.
  // Fail the deployment build if upload rules accidentally omit a real model.
  for (const model of ['face_landmarker.task', 'pose_landmarker_lite.task', 'hand_landmarker.task']) {
    const file = `public/expression-vision/${model}`;
    const asset = await stat(file).catch(() => null);
    if (!asset?.isFile() || asset.size < 1000000) throw new Error(`Missing vision model asset: ${file}`);
  }
  // Reuse the installed package assets; avoid a second CDN dependency at runtime.
  await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/expression-vision', { recursive: true });
  await build({
    entryPoints: ['src/lib/expressionVision.worker.js'],
    outfile: 'public/expression-worker.js', bundle: true, format: 'iife',
    platform: 'browser', target: 'es2020', minify: true, legalComments: 'inline',
  });
}
