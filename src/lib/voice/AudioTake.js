// Records the same live stream used by capture. No synthetic samples or timers.
export class AudioTake {
  /** @param {{ onSave?: (recording: any) => Promise<any>, onError?: (message: string) => void, environment?: any }} options */
  constructor({
    onSave,
    onError,
    environment = globalThis
  } = {}) {
    this.onSave = onSave;
    this.onError = onError;
    this.env = environment;
    /** @type {string|null} */
    this.id = null;
  }
  start(stream) {
    const Recorder = this.env.MediaRecorder;
    this.id = null;
    this.stoppedAt = null;
    this.error = null;
    this.done = null;
    this.recorder = null;
    if (!Recorder) {
      this.onError?.('Audio recording is unavailable in this browser. Transcript practice is still available.');
      return;
    }
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => Recorder.isTypeSupported(type));
    if (!mime) {
      this.onError?.('This browser cannot record a supported audio format.');
      return;
    }
    try {
      this.id = crypto.randomUUID();
      const id = this.id;
      const chunks = [];
      this.recorder = new Recorder(stream, {
        mimeType: mime,
        audioBitsPerSecond: 64000
      });
      this.done = new Promise(resolve => {
        this.recorder.ondataavailable = event => {
          if (event.data.size) chunks.push(event.data);
        };
        this.recorder.onerror = () => {
          this.error = new Error('Recording was interrupted. Review your transcript and record again.');
          this.onError?.(this.error.message);
        };
        this.recorder.onstop = async () => {
          try {
            const blob = new Blob(chunks, {
              type: mime
            });
            if (!blob.size || this.error) throw this.error || new Error('Recording was empty. Please record again.');
            await this.onSave?.({
              id,
              blob,
              startedAt: this.startedAt,
              durationSeconds: Math.max(0, ((this.stoppedAt || Date.now()) - this.startedAt) / 1000)
            });
            resolve(id);
          } catch (error) {
            this.error = error;
            this.onError?.(error.message);
            resolve(null);
          }
        };
      });
      this.startedAt = Date.now();
      this.recorder.start(250);
    } catch (error) {
      this.id = null;
      this.error = error;
      this.onError?.('Recording could not start. Your typed answer is still available.');
    }
  }
  async stop() {
    if (this.recorder?.state === 'recording' || this.recorder?.state === 'paused') { this.stoppedAt = Date.now(); this.recorder.stop(); }
    if (!this.done) return null;
    let timer;
    try {
      return await Promise.race([this.done, new Promise(resolve => {
        timer = this.env.setTimeout(() => {
          this.onError?.('Audio could not finish saving. Keep your transcript and record again.');
          resolve(null);
        }, 5000);
      })]);
    } finally {
      this.env.clearTimeout(timer);
    }
  }
}
