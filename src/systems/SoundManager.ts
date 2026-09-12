import { SettingsManager } from './SettingsManager';
type OscType = OscillatorType;

export class SoundManager {
  private static instance: SoundManager;
  private ctx: AudioContext | null = null;
  private output: GainNode | null = null;
  private lastShootAt = -Infinity;
  private lastHitAt = -Infinity;
  private lastKillAt = -Infinity;
  private masterVol = 0.3;
  private unlockBound = false;

  private constructor() {}

  static get(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  private ensureCtx(): AudioContext {
    this.masterVol = 1;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.output = this.ctx.createGain();
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.ratio.value = 8;
      this.output.connect(compressor);
      compressor.connect(this.ctx.destination);
    }
    this.output!.gain.value = SettingsManager.get().volume;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => { /* retried on user gesture */ });
      if (!this.unlockBound && typeof window !== 'undefined') {
        this.unlockBound = true;
        const unlock = (): void => {
          void this.ctx?.resume().catch(() => { /* audio remains optional */ });
        };
        window.addEventListener('pointerdown', unlock, { once: true });
        window.addEventListener('keydown', unlock, { once: true });
      }
    }
    return this.ctx;
  }

  private createNoiseBuffer(durationSec: number): AudioBuffer {
    const ctx = this.ensureCtx();
    const length = Math.ceil(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private playTone(
    type: OscType,
    freq: number,
    durationSec: number,
    peak = 0.4,
    attackSec = 0.005,
  ): void {
    const ctx = this.ensureCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(peak * this.masterVol, t + attackSec);
    gain.gain.exponentialRampToValueAtTime(0.001, t + durationSec);
    osc.connect(gain);
    gain.connect(this.output!);
    osc.start(t);
    osc.stop(t + durationSec + 0.01);
  }

  private playSweep(
    type: OscType,
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    peak = 0.4,
    attackSec = 0.005,
  ): void {
    const ctx = this.ensureCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t + durationSec);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(peak * this.masterVol, t + attackSec);
    gain.gain.exponentialRampToValueAtTime(0.001, t + durationSec);
    osc.connect(gain);
    gain.connect(this.output!);
    osc.start(t);
    osc.stop(t + durationSec + 0.01);
  }

  private playNoise(
    durationSec: number,
    peak = 0.35,
    bandpassHz?: number,
    q = 1,
  ): void {
    const ctx = this.ensureCtx();
    const t = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.createNoiseBuffer(durationSec);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak * this.masterVol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + durationSec);
    if (bandpassHz !== undefined) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = bandpassHz;
      filter.Q.value = q;
      source.connect(filter);
      filter.connect(gain);
    } else {
      source.connect(gain);
    }
    gain.connect(this.output!);
    source.start(t);
    source.stop(t + durationSec + 0.01);
  }

  shoot(): void {
    const now = performance.now();
    if (now - this.lastShootAt < 65) return;
    this.lastShootAt = now;
    this.playSweep('sine', 640, 420, 0.04, 0.12);
  }

  hit(): void {
    const now = performance.now();
    if (now - this.lastHitAt < 50) return;
    this.lastHitAt = now;
    const ctx = this.ensureCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t);
    gain.gain.setValueAtTime(0.45 * this.masterVol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain);
    gain.connect(this.output!);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  kill(): void {
    const now = performance.now();
    if (now - this.lastKillAt < 75) return;
    this.lastKillAt = now;
    this.playSweep('sine', 400, 800, 0.1, 0.35);
  }

  dash(): void {
    this.playNoise(0.12, 0.4, 1000, 0.8);
  }

  skillBurst(): void {
    const ctx = this.ensureCtx();
    const t = ctx.currentTime;
    const duration = 0.2;
    const peak = 0.55 * this.masterVol;

    for (const freq of [150, 300]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(peak, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.connect(gain);
      gain.connect(this.output!);
      osc.start(t);
      osc.stop(t + duration + 0.01);
    }
  }

  skillBarrage(): void {
    const ctx = this.ensureCtx();
    const burstLen = 0.025;
    const offsets = [0, 0.05, 0.1];

    for (const offset of offsets) {
      const t = ctx.currentTime + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(600, t);
      gain.gain.setValueAtTime(0.3 * this.masterVol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + burstLen);
      osc.connect(gain);
      gain.connect(this.output!);
      osc.start(t);
      osc.stop(t + burstLen + 0.01);
    }
  }

  skillTimeRift(): void {
    this.playSweep('triangle', 300, 100, 0.5, 0.3, 0.02);
  }

  pickup(): void {
    this.playTone('sine', 1200, 0.06, 0.3);
    const ctx = this.ensureCtx();
    const t = ctx.currentTime + 0.06;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1600, t);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.3 * this.masterVol, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(gain);
    gain.connect(this.output!);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  heroHit(): void {
    const ctx = this.ensureCtx();
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, t);
    gain.gain.setValueAtTime(0.5 * this.masterVol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(gain);
    gain.connect(this.output!);
    osc.start(t);
    osc.stop(t + 0.09);

    const source = ctx.createBufferSource();
    source.buffer = this.createNoiseBuffer(0.04);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25 * this.masterVol, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    source.connect(noiseGain);
    noiseGain.connect(this.output!);
    source.start(t);
    source.stop(t + 0.05);
  }

  heroDeath(): void {
    this.playSweep('triangle', 392, 261.63, 0.5, 0.22, 0.01);
  }

  waveStart(): void {
    const ctx = this.ensureCtx();
    const freqs = [500, 700, 500];
    const noteLen = 0.12;

    freqs.forEach((freq, i) => {
      const t = ctx.currentTime + i * noteLen;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.35 * this.masterVol, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + noteLen);
      osc.connect(gain);
      gain.connect(this.output!);
      osc.start(t);
      osc.stop(t + noteLen + 0.01);
    });
  }

  bossAlert(): void {
    this.playSweep('triangle', 329.63, 523.25, 0.4, 0.28, 0.025);
  }

  getVolume(): number { return SettingsManager.get().volume; }
  setVolume(volume: number): void {
    const settings = SettingsManager.update({ volume });
    if (this.output && this.ctx) this.output.gain.setTargetAtTime(settings.volume, this.ctx.currentTime, .015);
  }

  upgrade(): void {
    const ctx = this.ensureCtx();
    const freqs = [800, 1200, 1600];
    const step = 0.045;

    freqs.forEach((freq, i) => {
      const t = ctx.currentTime + i * step;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.32 * this.masterVol, t + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.001, t + step);
      osc.connect(gain);
      gain.connect(this.output!);
      osc.start(t);
      osc.stop(t + step + 0.01);
    });
  }

  victory(): void {
    const ctx = this.ensureCtx();
    const freqs = [523.25, 659.25, 783.99, 1046.5];
    const noteLen = 0.15;

    freqs.forEach((freq, i) => {
      const t = ctx.currentTime + i * noteLen;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.38 * this.masterVol, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, t + noteLen);
      osc.connect(gain);
      gain.connect(this.output!);
      osc.start(t);
      osc.stop(t + noteLen + 0.01);
    });
  }

  buttonHover(): void {
    this.playTone('square', 1000, 0.015, 0.06);
  }

  buttonClick(): void {
    this.playTone('square', 800, 0.025, 0.2);
  }
}

export default SoundManager;
