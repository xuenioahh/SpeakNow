const finite = Number.isFinite;
const mean = values => values.reduce((a,b) => a+b,0)/values.length;

// Aggregates the existing Worker landmarks into observable intervals. Missing
// landmarks reset the relevant window and never become a zero-valued score.
export class VisionTimeline {
  constructor(sessionId) {
    this.sessionId = sessionId; this.events = []; this.active = new Map();
    this.recent = []; this.calibration = []; this.last = null; this.frames = 0;
    this.valid = { face: 0, body: 0, hands: 0 }; this.pitchBaseline = null;
  }
  sample(sample, context = { speaker: 'none', turnId: null }) {
    if (!finite(sample?.time) || (this.last !== null && sample.time <= this.last)) return;
    const time = sample.time;
    const gap=this.last===null?0:time-this.last;
    if (this.last !== null && gap > 2.5) this.flush(this.last);
    this.last = time; this.frames++;
    if (finite(sample.head)) this.valid.face++;
    if (finite(sample.posture)) this.valid.body++;
    if (finite(sample.leftHand) && finite(sample.rightHand)) this.valid.hands++;
    if (finite(sample.headVertical) && this.calibration.length < 12) {
      this.calibration.push(sample.headVertical);
      if (this.calibration.length >= 8) this.pitchBaseline = mean(this.calibration);
    }
    this.recent.push(sample); this.recent = this.recent.filter(item => time-item.time <= Math.min(3,Math.max(1.25,gap*3.5)));
    const feature = key => { const values = this.recent.map(item => item[key]).filter(finite); return values.length >= 3 && finite(sample[key]) ? mean(values) : null; };
    const head = feature('head'), pitch = feature('headVertical'), tilt = feature('headTilt');
    const gaze = feature('gazeHorizontal'), lean = feature('bodyLean'), posture = feature('posture');
    const headBody=feature('headBodyOffset'),contrast=feature('imageContrast'),edges=feature('edgeEnergy');
    const faceX = feature('faceX'), faceY = feature('faceY'), light = feature('luminance');
    const range = key => { const values=this.recent.map(item=>item[key]).filter(finite); return values.length>=4 && finite(sample[key]) ? Math.max(...values)-Math.min(...values) : null; };
    const hands = Math.max(range('leftHand') ?? 0,range('rightHand') ?? 0);
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
    ];
    const keys = new Set();
    for (const [kind, present, label, source] of conditions) {
      if (!present) continue;
      const key = `${kind}:${context.speaker}:${context.turnId || ''}`; keys.add(key);
      let event = this.active.get(key);
      if (!event) { event={ kind,label,source,sessionId:this.sessionId,turnId:context.turnId,speaker:context.speaker,start:time,end:time,samples:0,availability:'observed',confidence:'landmark proxy' };this.active.set(key,event); }
      event.end=time;event.samples++;
    }
    for (const [key,event] of this.active) if (!keys.has(key)) { this.commit(event);this.active.delete(key); }
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
    return { sessionId:this.sessionId,source:'device-mediapipe',frames:this.frames,validSamples:{...this.valid},events:[...this.events,...ongoing].map(event=>({...event,start:Number(event.start.toFixed(2)),end:Number(event.end.toFixed(2))})) };
  }
}
