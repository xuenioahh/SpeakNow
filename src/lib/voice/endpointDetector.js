export class EndpointDetector {
  constructor({ silenceMs = 2500, minSpeechMs = 350, attackMs = 150 } = {}) {
    this.silenceMs = silenceMs;
    this.minSpeechMs = minSpeechMs;
    this.attackMs = attackMs;
    this.noise = 0.008;
    this.last = null;
    this.attack = 0;
    this.speech = 0;
    this.quiet = 0;
    this.active = false;
    this.heardSpeech = false;
  }
  update(rms, now) {
    if (!Number.isFinite(rms) || !Number.isFinite(now)) return false;
    const delta = this.last === null ? 0 : Math.min(Math.max(now - this.last, 0), 100);
    this.last = now;
    const enter = Math.max(0.018, this.noise * 3 + 0.006);
    const leave = Math.max(0.011, this.noise * 1.6);
    if (!this.active) {
      if (rms >= enter) this.attack += delta;
      else {
        this.attack = 0;
        this.noise += (Math.min(rms, 0.04) - this.noise) * (1 - Math.exp(-delta / 1500));
      }
      if (this.attack >= this.attackMs) {
        this.active = true;
        this.speech += this.attack;
        this.quiet = 0;
      }
    } else if (rms >= leave) {
      this.speech += delta;
      this.quiet = 0;
    } else {
      this.active = false;
      this.attack = 0;
      if (!this.heardSpeech) this.speech = 0;
    }
    if (!this.active && this.speech >= this.minSpeechMs) this.quiet += delta;
    this.heardSpeech ||= this.speech >= this.minSpeechMs;
    return this.heardSpeech && !this.active && this.quiet >= this.silenceMs;
  }
}
