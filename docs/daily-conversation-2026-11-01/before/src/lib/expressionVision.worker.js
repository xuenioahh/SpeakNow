import { landmarkMetrics } from './expressionLandmarks.js';
import { FaceLandmarker, PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let face;
let pose;
let imageCanvas,imageContext;

self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const files = await FilesetResolver.forVisionTasks('/expression-vision');
      face = await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/expression-vision/face_landmarker.task' },
        runningMode: 'VIDEO', numFaces: 1,
      });
      pose = await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/expression-vision/pose_landmarker_lite.task' },
        runningMode: 'VIDEO', numPoses: 1,
      });
      self.postMessage({ type: 'ready' });
    } catch (error) { console.warn('Visual analysis initialization failed:', error.message); self.postMessage({ type: 'error' }); }
    return;
  }
  if (data.type !== 'frame') return;
  const began = performance.now();
  try {
    const f = face.detectForVideo(data.frame, data.timestamp).faceLandmarks[0];
    const p = pose.detectForVideo(data.frame, data.timestamp).landmarks[0];
    const metrics = landmarkMetrics(f, p, true);
    // Tiny downsample in the Worker; no frame pixels leave this process.
    try {
      if(!imageCanvas){imageCanvas=new OffscreenCanvas(64,48);imageContext=imageCanvas.getContext('2d');}
      imageContext.drawImage(data.frame,0,0,64,48);
      const pixels=imageContext.getImageData(0,0,64,48).data,gray=new Float32Array(3072);
      let sum=0,square=0,edges=0;
      for(let i=0;i<gray.length;i++){const value=(.2126*pixels[i*4]+.7152*pixels[i*4+1]+.0722*pixels[i*4+2])/255;gray[i]=value;sum+=value;square+=value*value;if(i%64)edges+=Math.abs(value-gray[i-1]);}
      metrics.luminance=sum/gray.length;
      metrics.imageContrast=Math.sqrt(Math.max(0,square/gray.length-metrics.luminance**2));
      metrics.edgeEnergy=edges/(63*48);
    } catch { /* Pixel analysis unavailable; leave unassessed. */ }
    self.postMessage({ type: 'sample', time: data.time, ...metrics, processingMs: performance.now()-began, source: 'device-mediapipe' });
  } catch { self.postMessage({ type: 'sample', time: data.time }); }
  finally { data.frame.close(); }
};
