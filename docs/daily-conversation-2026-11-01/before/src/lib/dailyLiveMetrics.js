// Live observations from the current learner session. These are measurements and
// limited proxies, not exam scores or inferred emotions.
const finite = value => typeof value === 'number' && Number.isFinite(value);
const words = text => String(text || '').trim().split(/\s+/).filter(Boolean);
const bounded = (value, low, high) => Math.min(high, Math.max(low, value));

export class DailyLiveMetrics {
  constructor() {
    this.metrics = {};
    this.audio = { last: null, first: null, voiced: 0, silence: 0, pauses: 0, hasSpeech: false, samples: 0 };
    this.video = { last: null, frames: 0, moves: 0, first: null, previousHands: null };
    this.timeline = [];
    this.turns=[];this.pauseEvents=[];
  }
  put(key, value, source, time, samples, reliability = 'measured', start = time) {
    if (!finite(time) || value === null || value === undefined) return;
    this.metrics[key] = { value, source, updatedAt: time, samples, reliability, start, end: time };
  }
  audioSample(time, rms, recording, transcript = '', context = {}) {
    if (!recording || !finite(time) || !finite(rms)) { this.audio.last = null; return; }
    const a = this.audio, dt = a.last === null ? 0 : bounded(time - a.last, 0, 0.3);
    a.first ??= time;
    a.last = time; a.samples++;
    const voiced = rms >= 0.018;
    if (voiced) {
      if (a.hasSpeech && a.silence >= 0.45) { a.pauses++;const pause={kind:'pause',start:time-a.silence,end:time,duration:a.silence,source:'microphone RMS voice activity',...context};this.pauseEvents.push(pause); }
      a.hasSpeech = true; a.voiced += dt; a.silence = 0;
    } else if (a.hasSpeech) a.silence += dt;
    if (a.samples >= 3) this.put('volume', `${Math.round(20 * Math.log10(Math.max(rms, 0.0001)))} dBFS`, 'microphone RMS', time, a.samples);
    if (a.hasSpeech) this.put('pauses', `${a.pauses} pauses`, 'microphone voice activity', time, a.samples, 'estimated');
    if (a.hasSpeech && time - a.first >= 1) this.put('fluency', `${Math.round(a.voiced / (time - a.first) * 100)}% active speech`, 'microphone voiced/elapsed time', time, a.samples, 'continuity proxy');
    const count = words(transcript).length;
    if (count >= 3 && a.voiced >= 1) this.put('pace', `${Math.round(count / a.voiced * 60)} wpm`, 'transcript + voiced microphone time', time, a.samples, 'estimated');
  }
  turn(text, time) {
    const count = words(text).length;
    if (!count || !finite(time)) return;
    const a = this.audio;
    if (a.voiced >= 1) this.put('pace', `${Math.round(count / a.voiced * 60)} wpm`, 'confirmed transcript + voiced microphone time', time, a.samples, 'estimated');
    const filler = (String(text).match(/\b(?:um|uh|erm)\b/gi) || []).length;
    this.put('fillers', `${filler} in this turn`, 'confirmed transcript', time, count, 'transcript only');
    this.turns.push({ kind: 'turn', time, words: count, voicedSeconds: Number(a.voiced.toFixed(2)), recordedSeconds:a.first===null?0:Math.max(0,(a.last??time)-a.first-a.silence),pauses: a.pauses,fillers:filler,samples:a.samples });
    this.audio = { last: null, first: null, voiced: 0, silence: 0, pauses: 0, hasSpeech: false, samples: 0 };
  }
  feedback(feedback, time) {
    if (!feedback || !finite(time)) return;
    for (const [key, field] of [['relevance', 'task'], ['grammar', 'grammar'], ['vocabulary', 'vocabulary']]) {
      const value = typeof feedback[field] === 'string' ? feedback[field].trim().slice(0, 140) : '';
      if (value) this.put(key, value, 'AI review of confirmed turn', time, 1, 'AI feedback');
    }
  }
  videoSample(sample) {
    const time = sample?.time;
    if (!finite(time)) return;
    const v = this.video;
    if (v.first === null) v.first = time;
    v.frames++;
    if (finite(sample.head)) {
      const direction = sample.head < -0.16 ? 'Turned left' : sample.head > 0.16 ? 'Turned right' : 'Near camera direction';
      this.put('headOrientation', direction, 'face landmarks: nose relative to eyes', time, v.frames, 'orientation proxy');
      this.put('cameraEngagement', Math.abs(sample.head) < 0.16 ? 'Facing camera direction' : 'Looking to the side', 'face landmarks: orientation proxy', time, v.frames, 'not eye contact');
    } else {delete this.metrics.headOrientation;delete this.metrics.cameraEngagement;}
    if (finite(sample.faceX) && finite(sample.faceY)) {
      const centered = sample.faceX >= 0.28 && sample.faceX <= 0.72 && sample.faceY >= 0.18 && sample.faceY <= 0.82;
      this.put('framing', centered ? 'Face within frame' : 'Face near frame edge', 'face landmark position', time, v.frames, 'measured');
    } else delete this.metrics.framing;
    if (finite(sample.posture)) this.put('posture', `Shoulder alignment ${sample.posture.toFixed(2)}`, 'visible shoulder landmarks', time, v.frames, 'partial body only');else delete this.metrics.posture;
    const hands = [sample.leftHand, sample.rightHand];
    if (hands.every(finite)) {
      if (v.previousHands && time - v.last <= 1 && Math.max(...hands.map((value, index) => Math.abs(value - v.previousHands[index]))) >= 0.12) v.moves++;
      v.previousHands = hands;
      this.put('handMovement', `${v.moves} movement events`, 'visible wrist landmarks', time, v.frames, 'movement proxy');
    } else {v.previousHands = null;delete this.metrics.handMovement;}
    v.last = time;
    this.timeline.push({ kind: 'video', time, faceX: finite(sample.faceX) ? sample.faceX : null, head: finite(sample.head) ? sample.head : null, hands: hands.every(finite) ? hands : null });
    if (this.timeline.length > 2400) this.timeline.shift();
  }
  cameraOff() {
    for (const key of ['headOrientation', 'cameraEngagement', 'framing', 'posture', 'handMovement']) delete this.metrics[key];
    this.video.previousHands = null; this.video.last = null;
  }
  snapshot() { return { ...this.metrics }; }
  summary() {
    /** @type {Record<string, any>} */
    const metrics=this.snapshot();
    const turns=this.turns.filter(item=>item.voicedSeconds>0);
    if(turns.length){
      const total=turns.reduce((sum,item)=>({words:sum.words+item.words,voiced:sum.voiced+item.voicedSeconds,recorded:sum.recorded+item.recordedSeconds,pauses:sum.pauses+item.pauses,fillers:sum.fillers+(item.fillers||0),samples:sum.samples+(item.samples||0)}),{words:0,voiced:0,recorded:0,pauses:0,fillers:0,samples:0});
      const base={source:'session microphone activity + confirmed transcripts',updatedAt:turns.at(-1).time,samples:total.samples,reliability:'estimated',start:0,end:turns.at(-1).time};
      if(total.voiced>=1)metrics.pace={...base,value:`${Math.round(total.words/total.voiced*60)} wpm`};
      metrics.pauses={...base,value:`${total.pauses} pauses`};
      if(total.recorded>0)metrics.fluency={...base,value:`${Math.round(total.voiced/total.recorded*100)}% active speech`};
      metrics.fillers={...base,value:`${total.fillers} in this conversation`};
    }
    return { metrics, timeline: [...this.turns,...this.pauseEvents,...this.timeline.slice(-2400)].sort((a,b)=>(a.time??a.start)-(b.time??b.start)) };
  }
}
