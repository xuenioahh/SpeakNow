const finite = Number.isFinite;
const mean = values => values.reduce((a,b) => a+b,0)/values.length;

// Aggregates the existing Worker landmarks into observable intervals. Missing
// landmarks reset the relevant window and never become a zero-valued score.
export class VisionTimeline {
  constructor(sessionId) {
    this.sessionId = sessionId; this.events = []; this.active = new Map();
    this.recent = []; this.calibration = []; this.last = null; this.frames = 0;
    this.valid = { face: 0, body: 0, hands: 0 }; this.pitchBaseline = null;
    this.featureSamples = []; this.droppedSamples = 0; this.windows = new Map(); this.models = {};
    this.coverage = {}; this.inference = { count: 0, totalMs: 0, maxMs: 0 };
  }
  sample(sample, context = { speaker: 'none', turnId: null }) {
    if (!finite(sample?.time) || (this.last !== null && sample.time <= this.last)) return;
    const time = sample.time;
    const gap=this.last===null?0:time-this.last;
    if (this.last !== null && gap > 2.5) this.flush(this.last);
    this.last = time; this.frames++;
    this.models = { ...this.models, ...sample.models };
    if (finite(sample.processingMs)) {
      this.inference.count++; this.inference.totalMs += sample.processingMs;
      this.inference.maxMs = Math.max(this.inference.maxMs, sample.processingMs);
    }
    if (finite(sample.head)) this.valid.face++;
    if (finite(sample.posture)) this.valid.body++;
    if (sample.handCount > 0 || finite(sample.leftHand) || finite(sample.rightHand)) this.valid.hands++;
    if (finite(sample.headVertical) && this.calibration.length < 12) {
      this.calibration.push(sample.headVertical);
      if (this.calibration.length >= 8) this.pitchBaseline = mean(this.calibration);
    }
    this.recent.push(sample); this.recent = this.recent.filter(item => time-item.time <= 5);
    this.recordFeatures(sample, context, gap);
    const feature = key => { const values = this.recent.map(item => item[key]).filter(finite); return values.length >= 3 && finite(sample[key]) ? mean(values) : null; };
    const head = feature('head'), pitch = feature('headVertical'), tilt = feature('headTilt');
    const gaze = feature('gazeHorizontal'), lean = feature('bodyLean'), posture = feature('posture');
    const headBody=feature('headBodyOffset'),contrast=feature('imageContrast'),edges=feature('edgeEnergy');
    const faceX = feature('faceX'), faceY = feature('faceY'), light = feature('luminance');
    const range = key => { const values=this.recent.map(item=>item[key]).filter(finite); return values.length>=4 && finite(sample[key]) ? Math.max(...values)-Math.min(...values) : null; };
    const handRange = side => {
      const points = this.recent.flatMap(item => (item.handTracks || []).filter(hand => hand.side === side));
      return points.length >= 4 ? Math.max(...['x','y'].map(axis => Math.max(...points.map(p => p[axis])) - Math.min(...points.map(p => p[axis])))) : 0;
    };
    const hands = sample.handModelAvailable ? Math.max(handRange('Left'), handRange('Right')) : Math.max(range('leftHand') ?? 0,range('rightHand') ?? 0);
    const facial = Math.max(range('mouth') ?? 0, range('brow') ?? 0);
    const conditions = [
      ['head-left', head !== null && head < -.2, 'Head turned left', 'face landmarks'],
      ['head-right', head !== null && head > .2, 'Head turned right', 'face landmarks'],
      ['head-down', pitch !== null && this.pitchBaseline !== null && pitch-this.pitchBaseline > .18, 'Head direction moved downward', 'face landmarks, relative to initial position'],
      ['head-up', pitch !== null && this.pitchBaseline !== null && pitch-this.pitchBaseline < -.18, 'Head direction moved upward', 'face landmarks, relative to initial position'],
      ['head-tilt', tilt !== null && Math.abs(tilt) > .18, 'Head tilted', 'eye landmark alignment'],
      ['gaze-away', gaze !== null && (gaze < .23 || gaze > .77), 'Iris direction shifted to the side', 'iris landmark proxy, not eye contact'],
      ['body-lean', lean !== null && Math.abs(lean) > .25, 'Visible upper body leaned', 'shoulder and hip landmarks'],
      ['head-body-offset',headBody!==null&&Math.abs(headBody)>.4,'Head position shifted relative to shoulders','visible nose and shoulder landmarks'],
      ['shoulder-tilt', posture !== null && Math.abs(posture) > .2, 'Shoulder alignment changed', 'visible shoulder landmarks'],
      ['hand-activity', hands > .18, 'Visible hand movement increased', 'wrist landmark trajectories'],
      ['facial-activity', facial > .12, 'Visible facial movement changed', 'mouth and brow landmark trajectories'],
      ['frame-edge', faceX !== null && faceY !== null && (faceX < .18 || faceX > .82 || faceY < .12 || faceY > .88), 'Face was near the frame edge', 'face landmark position'],
      ['low-light', light !== null && light < .12, 'Camera image was dark', 'sampled image luminance'],
      ['low-detail',contrast!==null&&edges!==null&&contrast<.025&&edges<.012,'Camera image contained little visible detail','sampled image contrast and edges; not a blur diagnosis'],
      ['face-missing', sample.facePresent === false, 'Face landmarks were unavailable', 'face detector availability; may include occlusion'],
      ['frame-cropped', sample.faceClipped === true || sample.bodyClipped === true, 'Visible landmarks approached the image boundary', 'face and shoulder image coordinates; crop estimate'],
      ['camera-close', feature('faceSize') !== null && feature('faceSize') > .48, 'Face occupied a large part of the frame', 'relative eye spacing; not physical camera distance'],
      ['camera-far', feature('faceSize') !== null && feature('faceSize') < .075, 'Face occupied a small part of the frame', 'relative eye spacing; not physical camera distance'],
      ['head-posture-stable', this.recent.length >= 12 && time-this.recent[0].time >= 3 && range('head') !== null && range('head') < .12 && range('posture') !== null && range('posture') < .12, 'Head direction and visible shoulder alignment stayed relatively stable', 'continuous landmark variation; no confidence or emotion inference'],
    ];
    const keys = new Set();
    for (const [kind, present, label, source] of conditions) {
      if (!present) continue;
      const key = `${kind}:${context.speaker}:${context.turnId || ''}`; keys.add(key);
      let event = this.active.get(key);
      if (!event) { event={ kind,label,source,sessionId:this.sessionId,turnId:context.turnId,speaker:context.speaker,start:time,end:time,samples:0,availability:'observed',confidence:null,confidenceBasis:sample.confidenceBasis || 'landmark proxy; calibrated confidence unavailable' };this.active.set(key,event); }
      event.end=time;event.samples++;
    }
    for (const [key,event] of this.active) if (!keys.has(key)) { this.commit(event);this.active.delete(key); }
  }
  recordFeatures(sample, context, gap) {
    const groups = {
      gaze: ['gazeHorizontal'], head: ['head','headVertical','headTilt'],
      posture: ['posture','bodyLean','headBodyOffset'],
      hands: ['handCount','leftHand','rightHand','leftHandX','leftHandY','rightHandX','rightHandY'], facial: ['mouth','brow'],
      presentation: ['faceX','faceY','faceSize','luminance','imageContrast','edgeEnergy'],
    };
    const bucketId = Math.floor(sample.time / 10);
    let window = this.windows.get(bucketId);
    if (!window) { window = { start: bucketId * 10, end: sample.time, features: {}, frames: 0 }; this.windows.set(bucketId, window); }
    window.end = sample.time; window.frames++;
    for (const [dimension, keys] of Object.entries(groups)) {
      const available = dimension === 'hands' ? sample.handCount > 0 || finite(sample.leftHand) || finite(sample.rightHand) : keys.some(key => finite(sample[key]));
      const coverage = this.coverage[dimension] ||= { observedSamples: 0, seconds: 0, nearCameraSamples: 0 };
      if (available) {
        coverage.observedSamples++;
        coverage.seconds += gap > 0 && gap <= 2.5 ? gap : 0;
        if (dimension === 'gaze' && sample.gazeHorizontal >= .23 && sample.gazeHorizontal <= .77 && Math.abs(sample.head ?? 1) < .2) coverage.nearCameraSamples++;
      }
      for (const key of keys) {
        const value = finite(sample[key]) ? sample[key] : null;
        const modality = ['gaze','head','facial'].includes(dimension) ? 'face' : dimension === 'hands' ? 'hands' : 'body';
        this.featureSamples.push({ sessionId: this.sessionId, timestamp: sample.time, featureType: key,
          featureValue: value, confidence: sample.confidence?.[modality] ?? null,
          confidenceBasis: sample.confidenceBasis || 'landmark proxy; calibrated confidence unavailable',
          availability: value === null ? 'not-assessed' : 'observed', speaker: context.speaker, turnId: context.turnId });
        if (value !== null) {
          const stat = window.features[key] ||= { count: 0, sum: 0, min: value, max: value };
          stat.count++; stat.sum += value; stat.min = Math.min(stat.min, value); stat.max = Math.max(stat.max, value);
        }
      }
    }
    // Full-session time buckets survive; only raw samples have a bounded tail.
    if (this.featureSamples.length > 6000) { const dropped=this.featureSamples.length-6000;this.featureSamples.splice(0,dropped);this.droppedSamples+=dropped; }
  }
  restore(saved) {
    if (!saved) return;
    this.events = saved.events || []; this.frames = saved.frames || 0;
    this.valid = saved.validSamples || this.valid; this.coverage = saved.coverage || {};
    this.models = saved.models || {}; this.featureSamples = saved.featureSamples || [];
    this.droppedSamples = saved.droppedSamples || 0;
    this.inference = saved.inference || this.inference;
    for (const window of saved.windows || []) this.windows.set(Math.floor(window.start / 10), window);
  }
  commit(event) {
    if (event.end-event.start < 1.25 || event.samples < 4) return;
    const previous=this.events.at(-1);
    if (previous && previous.kind===event.kind && previous.turnId===event.turnId && previous.speaker===event.speaker && event.start-previous.end<.8) { previous.end=event.end;previous.samples+=event.samples; }
    else this.events.push({...event});
  }
  flush(time = this.last) { for (const event of this.active.values()) { event.end=Math.min(time ?? event.end,event.end);this.commit(event); }this.active.clear();this.recent=[]; }
  summary() {
    const ongoing=[...this.active.values()].filter(event=>event.end-event.start>=1.25 && event.samples>=4);
    const definitions = [
      ['gaze','Eye contact & gaze direction','Iris and head direction estimates; not precise eye contact'],
      ['head','Head movement','Relative head orientation and its change over time'],
      ['posture','Posture','Visible shoulders and torso; cropped or hidden landmarks unavailable'],
      ['hands','Hand gestures',this.models.hands ? 'Hand Landmarker wrist trajectories; gesture quantity is not a quality score' : 'Visible Pose Landmarker wrists only'],
      ['facial','Facial activity','Observable mouth and eyebrow movement; no emotion inference'],
      ['presentation','Camera presentation','Framing, relative face scale and sampled image quality'],
      ['consistency','Visual consistency','Head, posture, gaze and gesture variation across time windows'],
    ];
    const windows = [...this.windows.values()].map(window => ({ ...window, features: Object.fromEntries(Object.entries(window.features).map(([key,value]) => [key,{ ...value, mean: value.sum/value.count, range: value.max-value.min }])) }));
    const consistencyWindows = windows.filter(window => window.frames >= 8 && window.end-window.start >= 3 && (window.features.head?.count >= 6 || window.features.posture?.count >= 6));
    const dimensions = definitions.map(([id,label,limitation]) => {
      const coverage = this.coverage[id];
      const observedSamples = id === 'consistency' ? consistencyWindows.length : coverage?.observedSamples || 0;
      return { id,label,limitation,availability: observedSamples >= (id === 'consistency' ? 2 : 4) ? 'observed' : 'not-assessed',
        observedSamples, observedSeconds: coverage ? Number(coverage.seconds.toFixed(2)) : null,
        ...(id === 'gaze' && observedSamples >= 4 ? { nearCameraDirectionRatio: coverage.nearCameraSamples/observedSamples } : {}) };
    });
    return { sessionId:this.sessionId,source:'device-mediapipe',frames:this.frames,validSamples:{...this.valid},models:this.models,
      dimensions, coverage:this.coverage, windows, featureSamples:this.featureSamples,rawSamplesTruncated:this.droppedSamples>0,droppedSamples:this.droppedSamples,inference:this.inference,
      events:[...this.events,...ongoing].map(event=>({...event,start:Number(event.start.toFixed(2)),end:Number(event.end.toFixed(2))})) };
  }
}
