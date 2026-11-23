import type { RawFrame } from '../input/types';
import type { JudgeResult, Rating } from './rhythmGame';

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
  beatSound(): void;
  judgeSound(result: JudgeResult): void;
  ratingSound(rating: Rating): void;
  eatSound(gold: boolean, multiplier: number): void;
  selfHitSound(): void;
  boostSound(): void;
  whackHitSound(gold: boolean, multiplier: number): void;
  whackRetreatSound(): void;
  extinguishSound(bonus: boolean): void;
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
    beatSound(): void {
      // 节拍音：短促三角波，不抢判定音的风头
      tone(880, 0.055, 0.1, { type: 'triangle' });
    },
    judgeSound(result: JudgeResult): void {
      if (result === 'perfect') {
        // 高音带一点泛音，最响的一档
        tone(1319, 0.12, 0.16, { type: 'triangle' });
        tone(1760, 0.1, 0.08, { type: 'triangle', when: 0.02 });
      } else if (result === 'good') {
        tone(988, 0.1, 0.12, { type: 'triangle' });
      } else {
        // 低音软咚，和 missSound 同一配方
        tone(180, 0.12, 0.13, { slideTo: 140 });
      }
    },
    ratingSound(rating: Rating): void {
      // S/A 上行琶音，B/C 平缓两音
      const steps =
        rating === 'S'
          ? [523, 659, 784, 1047]
          : rating === 'A'
            ? [523, 659, 784]
            : [392, 330];
      steps.forEach((freq, i) => tone(freq, 0.16, 0.16, { when: i * 0.11 }));
    },
    eatSound(gold: boolean, multiplier: number): void {
      // 连击越高音越高；金球是三连上行火花
      const k = 1 + 0.04 * multiplier;
      if (gold) {
        tone(784 * k, 0.09, 0.16, { type: 'triangle' });
        tone(988 * k, 0.09, 0.14, { type: 'triangle', when: 0.06 });
        tone(1319 * k, 0.12, 0.12, { type: 'triangle', when: 0.12 });
      } else {
        tone(660 * k, 0.08, 0.14, { type: 'triangle' });
        tone(880 * k, 0.09, 0.12, { type: 'triangle', when: 0.05 });
      }
    },
    selfHitSound(): void {
      tone(220, 0.2, 0.14, { slideTo: 110, type: 'sawtooth' });
    },
    boostSound(): void {
      tone(659, 0.1, 0.16, { type: 'triangle' });
      tone(988, 0.1, 0.16, { type: 'triangle', when: 0.08 });
      tone(1319, 0.16, 0.16, { type: 'triangle', when: 0.16 });
    },
    whackHitSound(gold: boolean, multiplier: number): void {
      // 短促「咚」：普通鼠两连、金鼠三连上行，连击越高音越高
      const k = 1 + 0.04 * multiplier;
      if (gold) {
        tone(784 * k, 0.08, 0.16, { type: 'triangle' });
        tone(988 * k, 0.08, 0.14, { type: 'triangle', when: 0.05 });
        tone(1319 * k, 0.1, 0.12, { type: 'triangle', when: 0.1 });
      } else {
        tone(660 * k, 0.07, 0.14, { type: 'triangle' });
        tone(880 * k, 0.08, 0.12, { type: 'triangle', when: 0.04 });
      }
    },
    whackRetreatSound(): void {
      // 缩回：轻轻下滑一下，和漏星的沉重感区分开
      tone(300, 0.09, 0.07, { slideTo: 220, type: 'sine' });
    },
    extinguishSound(bonus: boolean): void {
      // 「呼」：从高往低滑的白噪声感用滤波扫频近似；连吹加一声清亮叮
      tone(880, 0.18, 0.14, { slideTo: 220, type: 'sawtooth' });
      if (bonus) tone(1568, 0.1, 0.1, { type: 'triangle', when: 0.1 });
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
