import { FaceLandmarker, PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let face;
let pose;
const valid = p => p && (p.visibility === undefined || p.visibility > 0.65);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm');
      face = await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' },
        runningMode: 'VIDEO', numFaces: 1,
      });
      pose = await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task' },
        runningMode: 'VIDEO', numPoses: 1,
      });
      self.postMessage({ type: 'ready' });
    } catch { self.postMessage({ type: 'error' }); }
    return;
  }
  if (data.type !== 'frame') return;
  try {
    const f = face.detectForVideo(data.frame, data.timestamp).faceLandmarks[0];
    const p = pose.detectForVideo(data.frame, data.timestamp).landmarks[0];
    const metrics = {};
    if (f) {
      const width = distance(f[33], f[263]);
      if (width > 0.03) {
        metrics.head = (f[1].x - (f[33].x + f[263].x) / 2) / width;
        metrics.headVertical = (f[1].y - (f[33].y + f[263].y) / 2) / width;
        // Iris position proxy, not eye contact, emotion or attention inference.
        if (f[468]) metrics.eyes = distance(f[468], f[33]) / Math.max(0.01, distance(f[133], f[33]));
      }
    }
    if (p && valid(p[11]) && valid(p[12])) {
      const width = distance(p[11], p[12]);
      if (width > 0.03) {
        metrics.posture = (p[11].y - p[12].y) / width;
        if (valid(p[15]) && valid(p[16])) {
          metrics.hands = (distance(p[15], p[11]) + distance(p[16], p[12])) / (2 * width);
          metrics.leftHand = (p[15].y - p[11].y) / width;
          metrics.rightHand = (p[16].y - p[12].y) / width;
        }
      }
    }
    self.postMessage({ type: 'sample', time: data.time, ...metrics });
  } catch { self.postMessage({ type: 'sample', time: data.time }); }
  finally { data.frame.close(); }
};
