import { landmarkMetrics } from './expressionLandmarks.js';
import { FaceLandmarker, PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let face;
let pose;

self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const files = await FilesetResolver.forVisionTasks('/expression-vision');
      face = await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' },
        runningMode: 'VIDEO', numFaces: 1,
      });
      pose = await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task' },
        runningMode: 'VIDEO', numPoses: 1,
      });
      self.postMessage({ type: 'ready' });
    } catch (error) { console.warn('Visual analysis initialization failed:', error.message); self.postMessage({ type: 'error' }); }
    return;
  }
  if (data.type !== 'frame') return;
  try {
    const f = face.detectForVideo(data.frame, data.timestamp).faceLandmarks[0];
    const p = pose.detectForVideo(data.frame, data.timestamp).landmarks[0];
    const metrics = landmarkMetrics(f, p);
    // Tiny downsample in the Worker; no frame pixels leave this process.
    try {
      const canvas = new OffscreenCanvas(16, 16), context = canvas.getContext('2d');
      context.drawImage(data.frame, 0, 0, 16, 16);
      const pixels = context.getImageData(0, 0, 16, 16).data;
      let sum = 0;
      for (let i = 0; i < pixels.length; i += 4) sum += (0.2126*pixels[i] + 0.7152*pixels[i+1] + 0.0722*pixels[i+2])/255;
      metrics.luminance = sum / 256;
    } catch { /* Pixel analysis unavailable; leave unassessed. */ }
    self.postMessage({ type: 'sample', time: data.time, ...metrics });
  } catch { self.postMessage({ type: 'sample', time: data.time }); }
  finally { data.frame.close(); }
};
