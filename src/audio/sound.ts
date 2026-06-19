/**
 * Tiny Web Audio sound engine — all SFX and the ambient music bed are
 * synthesised at runtime, so there are no audio files to ship or load.
 */
class SoundEngine {
  private ctx?: AudioContext;
  private master?: GainNode;
  private sfx?: GainNode;
  private muted = false;

  init() {
    this.muted = localStorage.getItem("hh-muted") === "1";
    const unlock = () => {
      this.ensure();
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
  }

  private ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 0.6;
    this.sfx.connect(this.master);
  }

  setMuted(m: boolean) {
    this.muted = m;
    localStorage.setItem("hh-muted", m ? "1" : "0");
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.03);
  }
  isMuted() {
    return this.muted;
  }

  private now() {
    this.ensure();
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private tone(freq: number, t0: number, dur: number, type: OscillatorType, peak: number, slideTo?: number) {
    if (!this.ctx || !this.sfx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.sfx);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  private noise(t0: number, dur: number, peak: number, filterHz: number) {
    if (!this.ctx || !this.sfx) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = filterHz;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    src.start(t0);
    src.stop(t0 + dur);
  }

  // ---- SFX -----------------------------------------------------------
  click() {
    const t = this.now();
    this.tone(440, t, 0.06, "triangle", 0.1, 560);
  }
  till() {
    const t = this.now();
    this.noise(t, 0.2, 0.4, 480);
    this.tone(150, t, 0.18, "sine", 0.22, 80);
  }
  plant() {
    const t = this.now();
    this.tone(520, t, 0.13, "sine", 0.22, 820);
  }
  harvest() {
    const t = this.now();
    [523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, t + i * 0.06, 0.2, "triangle", 0.18));
  }
  coin(combo = 1) {
    const t = this.now();
    const p = 1 + Math.min(Math.max(combo - 1, 0), 12) * 0.06; // pitch climbs with combo
    this.tone(900 * p, t, 0.07, "square", 0.08, 1350 * p);
    this.tone(1350 * p, t + 0.05, 0.09, "square", 0.06);
  }
  buy() {
    const t = this.now();
    [392, 523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, t + i * 0.07, 0.24, "triangle", 0.16));
  }
  levelUp() {
    const t = this.now();
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, t + i * 0.09, 0.3, "triangle", 0.2));
  }
}

export const Sound = new SoundEngine();
