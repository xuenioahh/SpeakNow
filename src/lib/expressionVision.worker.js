import { landmarkMetrics } from './expressionLandmarks.js';
import { FaceLandmarker, PoseLandmarker, HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let face;
let pose;
let hand;
let imageCanvas,imageContext;

self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const files = await FilesetResolver.forVisionTasks('/expression-vision');
      const results = await Promise.allSettled([FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/expression-vision/face_landmarker.task' },
        runningMode: 'VIDEO', numFaces: 1,
        minFaceDetectionConfidence: .65, minFacePresenceConfidence: .65, minTrackingConfidence: .65,
      }), PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/expression-vision/pose_landmarker_lite.task' },
        runningMode: 'VIDEO', numPoses: 1,
        minPoseDetectionConfidence: .65, minPosePresenceConfidence: .65, minTrackingConfidence: .65,
      }), HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/expression-vision/hand_landmarker.task' },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: .65, minHandPresenceConfidence: .65, minTrackingConfidence: .65,
      })]);
      [face, pose, hand] = results.map(result => result.status === 'fulfilled' ? result.value : null);
      if (!face && !pose && !hand) throw new Error('No visual model could be loaded');
      self.postMessage({ type: 'ready', models: { face: Boolean(face), pose: Boolean(pose), hands: Boolean(hand) } });
    } catch (error) { console.warn('Visual analysis initialization failed:', error.message); self.postMessage({ type: 'error' }); }
    return;
  }
  if (data.type !== 'frame') return;
  const began = performance.now();
  try {
    // A failed model does not turn missing data into evidence of absence.
    let f, p, h, faceObserved = false, bodyObserved = false, handsObserved = false;
    try { const result = face?.detectForVideo(data.frame, data.timestamp); faceObserved = Boolean(result); f = result?.faceLandmarks[0]; } catch { /* unavailable */ }
    try { const result = pose?.detectForVideo(data.frame, data.timestamp); bodyObserved = Boolean(result); p = result?.landmarks[0]; } catch { /* unavailable */ }
    try {
      const result = hand?.detectForVideo(data.frame, data.timestamp);
      handsObserved = Boolean(result);
      if (result) h = result.landmarks.map((landmarks, index) => ({ landmarks, side: result.handedness[index]?.[0]?.categoryName || `hand-${index}` }));
    } catch { /* unavailable */ }
    const metrics = landmarkMetrics(f, p, false, h);
    if (faceObserved) metrics.facePresent = Boolean(f);
    else delete metrics.facePresent;
    if (bodyObserved) metrics.bodyPresent = Boolean(p);
    else delete metrics.bodyPresent;
    metrics.models = { face: Boolean(face), pose: Boolean(pose), hands: Boolean(hand) };
    metrics.inference = { face: faceObserved, pose: bodyObserved, hands: handsObserved };
    // Face/Hand tasks expose acceptance thresholds, not a calibrated confidence
    // for each landmark. Do not present those thresholds as measured confidence.
    metrics.confidence = { face: null, body: metrics.poseVisibility ?? null, hands: null };
    metrics.confidenceBasis = 'Face/Hand detection, presence and tracking thresholds >=0.65; body confidence is minimum shoulder visibility; null means not exposed by model';
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
