import type { RawFrame } from '../input/types';

/**
 * 全部音效都用 Web Audio 合成，零音频文件。
 * 音量分两级：事件音走 master（0.3），光标跟随音自己一路（0.02–0.05），
 * 静音时两级一起关。
 */

const MASTER_VOLUME = 0.3;
const TRACKING_MIN_VOLUME = 0.02;
const TRACKING_MAX_VOLUME = 0.05;
const TRACKING_FREQ = 220;

export interface GameSounds {
  catchSound(multiplier: number): void;
  missSound(): void;
  startSound(): void;
  endSound(): void;
  confirmSound(frame: RawFrame | null): void;
  setTracking(cursorX: number, active: boolean): void;
  setMuted(muted: boolean): void;
  dispose(): void;
}

export function createGameSounds(): GameSounds {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let trackingOsc: OscillatorNode | null = null;
  let trackingGain: GainNode | null = null;
  let muted = false;
  let trackingTarget = 0;
  let trackingActive = false;

  const ensure = (): AudioContext | null => {
    if (typeof globalThis.AudioContext === 'undefined') return null;
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_VOLUME;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  };

  const tone = (
    freq: number,
    dur: number,
    vol: number,
    opts: { type?: OscillatorType; when?: number; slideTo?: number } = {},
  ): void => {
    const c = ensure();
    if (!c || !master) return;
    const t0 = c.currentTime + (opts.when ?? 0);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  };

  const applyTracking = (): void => {
    if (!ctx || !trackingGain) return;
    const target = muted || !trackingActive ? 0 : trackingTarget;
    trackingGain.gain.setTargetAtTime(target, ctx.currentTime, 0.06);
  };

  const ensureTracking = (): void => {
    const c = ensure();
    if (!c || trackingOsc) return;
    trackingOsc = c.createOscillator();
    trackingOsc.type = 'sine';
    trackingOsc.frequency.value = TRACKING_FREQ;
    trackingGain = c.createGain();
    trackingGain.gain.value = 0;
    trackingOsc.connect(trackingGain);
    // 有意不接 master：光标音永远轻，不吃 0.3 的总音量
    trackingGain.connect(c.destination);
    trackingOsc.start();
    applyTracking();
  };

  return {
    catchSound(multiplier: number): void {
      // 连击越高越响：523→784→1047 三连上行
      const vol = 0.14 + 0.06 * multiplier;
      tone(523, 0.09, vol, { when: 0 });
      tone(784, 0.09, vol, { when: 0.07 });
      tone(1047, 0.12, vol * 0.9, { when: 0.14 });
    },
    missSound(): void {
      tone(180, 0.12, 0.13, { slideTo: 140 });
    },
    startSound(): void {
      tone(523, 0.15, 0.2, { when: 0 });
      tone(659, 0.15, 0.2, { when: 0.09 });
      tone(784, 0.2, 0.2, { when: 0.18 });
    },
    endSound(): void {
      tone(523, 0.15, 0.2, { when: 0 });
      tone(659, 0.15, 0.2, { when: 0.09 });
      tone(784, 0.25, 0.2, { when: 0.18 });
    },
    confirmSound(frame: RawFrame | null): void {
      // 眨眼高一点、点头低一点；分不出来就用点头音
      const blinking = frame !== null && (frame.blinkL > 0.2 || frame.blinkR > 0.2);
      tone(blinking ? 880 : 660, 0.06, 0.2, { type: 'triangle' });
    },
    setTracking(cursorX: number, active: boolean): void {
      const magnitude = Math.min(1, Math.abs(cursorX));
      trackingTarget = TRACKING_MIN_VOLUME + (TRACKING_MAX_VOLUME - TRACKING_MIN_VOLUME) * magnitude;
      trackingActive = active;
      ensureTracking();
      applyTracking();
    },
    setMuted(m: boolean): void {
      muted = m;
      if (master) master.gain.value = m ? 0 : MASTER_VOLUME;
      applyTracking();
    },
    dispose(): void {
      void ctx?.close();
      ctx = null;
      master = null;
      trackingOsc = null;
      trackingGain = null;
    },
  };
}
