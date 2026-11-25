/**
 * Procedural sound effects synthesized with WebAudio - no audio assets needed.
 */
export type SfxName =
  | 'swing'
  | 'heavy'
  | 'hit'
  | 'crit'
  | 'chop'
  | 'mine'
  | 'pick'
  | 'pickup'
  | 'levelup'
  | 'hurt'
  | 'death'
  | 'place'
  | 'remove'
  | 'click'
  | 'quest'
  | 'discover'
  | 'craft'
  | 'dodge'
  | 'jump'
  | 'eat'
  | 'deny'
  | 'shoot'
  | 'slam'
  | 'door'
  | 'treefall'
  | 'boss';

export class AudioSys {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private ambient: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private last = new Map<string, number>();
  volume = 0.7;

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startAmbient();
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Ambient wind bed; intensity varies a bit with night. */
  private startAmbient() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0.035;
    src.connect(filter).connect(gain).connect(this.master!);
    src.start();
    this.ambient = { src, gain, filter };
  }

  setAmbient(windiness: number) {
    if (!this.ambient || !this.ctx) return;
    this.ambient.gain.gain.setTargetAtTime(0.02 + windiness * 0.04, this.ctx.currentTime, 0.5);
    this.ambient.filter.frequency.setTargetAtTime(300 + windiness * 400, this.ctx.currentTime, 0.5);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, filterType: BiquadFilterType, f0: number, f1?: number, when = 0, q = 1) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  play(name: SfxName, volume = 1) {
    if (!this.ctx || !this.master || this.volume <= 0) return;
    const now = performance.now();
    const prev = this.last.get(name) ?? 0;
    if (now - prev < 35) return; // de-duplicate bursts
    this.last.set(name, now);
    const v = volume;
    switch (name) {
      case 'swing':
        this.noise(0.18, 0.25 * v, 'bandpass', 900, 2600, 0, 1.4);
        break;
      case 'heavy':
        this.noise(0.32, 0.35 * v, 'bandpass', 500, 1800, 0, 1.2);
        break;
      case 'dodge':
        this.noise(0.22, 0.18 * v, 'lowpass', 1400, 300);
        break;
      case 'jump':
        this.noise(0.12, 0.08 * v, 'lowpass', 900, 400);
        break;
      case 'hit':
        this.tone(160, 0.12, 'square', 0.18 * v, 0, 60);
        this.noise(0.08, 0.3 * v, 'highpass', 2000);
        break;
      case 'crit':
        this.tone(220, 0.16, 'square', 0.2 * v, 0, 70);
        this.noise(0.12, 0.35 * v, 'highpass', 2500);
        this.tone(1320, 0.12, 'triangle', 0.08 * v, 0.02);
        break;
      case 'chop':
        this.tone(240, 0.09, 'triangle', 0.25 * v, 0, 120);
        this.noise(0.07, 0.25 * v, 'bandpass', 1200, 600, 0, 2);
        break;
      case 'mine':
        this.tone(1800, 0.12, 'triangle', 0.12 * v, 0, 1400);
        this.tone(2600, 0.08, 'sine', 0.06 * v, 0.01);
        this.noise(0.06, 0.25 * v, 'highpass', 3000);
        break;
      case 'pick':
        this.noise(0.12, 0.15 * v, 'bandpass', 2400, 1200, 0, 1.5);
        break;
      case 'pickup':
        this.tone(880, 0.08, 'sine', 0.12 * v);
        this.tone(1320, 0.12, 'sine', 0.1 * v, 0.05);
        break;
      case 'craft':
        this.tone(520, 0.08, 'triangle', 0.15 * v);
        this.tone(780, 0.1, 'triangle', 0.12 * v, 0.07);
        this.noise(0.1, 0.12 * v, 'bandpass', 1800, 900, 0.02, 2);
        break;
      case 'levelup':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.16 * v, i * 0.09));
        this.tone(1568, 0.6, 'sine', 0.08 * v, 0.36);
        break;
      case 'quest':
        [392, 523, 659].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.15 * v, i * 0.11));
        break;
      case 'discover':
        [659, 880, 988, 1318].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.1 * v, i * 0.12));
        break;
      case 'hurt':
        this.tone(120, 0.18, 'sawtooth', 0.15 * v, 0, 60);
        this.noise(0.12, 0.2 * v, 'lowpass', 900);
        break;
      case 'death':
        this.tone(300, 0.3, 'triangle', 0.15 * v, 0, 80);
        this.noise(0.25, 0.2 * v, 'lowpass', 1500, 200);
        break;
      case 'place':
        this.tone(140, 0.12, 'triangle', 0.25 * v, 0, 90);
        this.noise(0.08, 0.2 * v, 'lowpass', 1200);
        break;
      case 'remove':
        this.tone(300, 0.12, 'triangle', 0.15 * v, 0, 150);
        break;
      case 'click':
        this.tone(1200, 0.04, 'sine', 0.06 * v);
        break;
      case 'eat':
        this.noise(0.08, 0.15 * v, 'bandpass', 1500, 800, 0, 2);
        this.noise(0.08, 0.15 * v, 'bandpass', 1500, 800, 0.12, 2);
        break;
      case 'deny':
        this.tone(200, 0.12, 'square', 0.08 * v);
        this.tone(150, 0.16, 'square', 0.08 * v, 0.1);
        break;
      case 'shoot':
        this.tone(600, 0.3, 'sine', 0.1 * v, 0, 200);
        break;
      case 'slam':
        this.tone(70, 0.4, 'sine', 0.4 * v, 0, 30);
        this.noise(0.35, 0.35 * v, 'lowpass', 600, 100);
        break;
      case 'door':
        this.tone(180, 0.2, 'triangle', 0.12 * v, 0, 120);
        break;
      case 'treefall':
        this.noise(0.9, 0.25 * v, 'lowpass', 900, 120);
        this.tone(90, 0.5, 'sine', 0.2 * v, 0.6, 40);
        break;
      case 'boss':
        this.tone(55, 1.2, 'sawtooth', 0.15 * v, 0, 40);
        this.tone(82, 1.2, 'sawtooth', 0.1 * v, 0.1, 60);
        break;
    }
  }
}
