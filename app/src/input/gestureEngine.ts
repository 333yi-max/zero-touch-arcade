import { clamp, DEFAULT_CONFIG, type GestureConfig } from './config';
import type {
  Calibration,
  GestureEvent,
  RawFrame,
  UpdateResult,
} from './types';

/**
 * 没校准过时引擎自带的量程。校准页的「用默认值继续」直接引用这里，
 * 免得 0.18 这个数在两个地方各写一遍、日后改一边。
 */
export const DEFAULT_CALIBRATION: Required<Calibration> = {
  yawNeutral: 0,
  pitchNeutral: 0,
  range: 0.18,
  pitchRange: 0.18,
};

/**
 * 光标偏移 → cursorX 的纯数学，update() 和校准页的实时偏移条共用同一份，
 * 免得校准界面显示的「能不能走到边缘」和游戏里的实际行为是两套阈值。
 */
export function cursorFromDyaw(
  dyaw: number,
  range: number,
  cfg: Pick<GestureConfig, 'deadzone' | 'mirrorX'>,
): number {
  if (Math.abs(dyaw) <= cfg.deadzone) return 0;
  const span = Math.max(1e-6, range - cfg.deadzone);
  const magnitude = Math.min(1, (Math.abs(dyaw) - cfg.deadzone) / span);
  return clamp(Math.sign(dyaw) * magnitude * cfg.mirrorX, -1, 1);
}

/**
 * 手势引擎：纯逻辑，不依赖 DOM / 摄像头。
 * 输入 RawFrame，输出 InputState 和边沿事件。
 *
 * 设计原则：
 * 1. 所有阈值相对“校准后的量程”，不是绝对值。
 * 2. 每个手势触发后必须回中/释放才能再次触发，避免连发。
 * 3. 点头和眨眼都映射到 confirm；同一帧只触发一次。
 * 4. 转头和点头各用一份量程（range / pitchRange）：真人的 yaw 幅度约是 pitch 的两倍。
 */
export class GestureEngine {
  private cfg: GestureConfig;
  private calib: Required<Calibration> = { ...DEFAULT_CALIBRATION };

  private yawS = 0;
  private pitchS = 0;
  private hadFace = false;

  private nodSince: number | null = null;
  private nodArmed = true;
  private lastNod = -Infinity;

  private blinkSince: number | null = null;
  private blinkArmed = true;
  private lastBlink = -Infinity;

  private jawSince: number | null = null;
  private jawArmed = true;
  private lastJaw = -Infinity;

  constructor(cfg: Partial<GestureConfig> = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
  }

  /** 用 45 帧左右的“正对屏幕”样本求中性位 */
  calibrateNeutral(samples: RawFrame[]): void {
    if (samples.length === 0) {
      throw new Error('calibrateNeutral: samples is empty');
    }
    let y = 0;
    let p = 0;
    for (const s of samples) {
      y += s.yaw;
      p += s.pitch;
    }
    this.setNeutral(y / samples.length, p / samples.length);
  }

  /** 中性位单独设一次；非有限值直接忽略，别让一个 NaN 把量程全带崩。 */
  setNeutral(yawNeutral: number, pitchNeutral: number): void {
    if (Number.isFinite(yawNeutral)) this.calib.yawNeutral = yawNeutral;
    if (Number.isFinite(pitchNeutral)) this.calib.pitchNeutral = pitchNeutral;
  }

  /**
   * 用左右转头的最大偏移设置光标量程。
   * 取两边的**较小值**：一边转不到位，光标就永远走不到那一侧的边缘，
   * 宁可让另一边提前饱和。活动范围小的人会被放大到 rangeMin，仍能走满全场。
   */
  setRangeFromOffsets(leftOffset: number, rightOffset: number): number {
    const raw = Math.min(Math.abs(leftOffset), Math.abs(rightOffset));
    this.calib.range = clamp(raw, this.cfg.rangeMin, this.cfg.rangeMax);
    return this.calib.range;
  }

  /** 用点头峰值单独设一份量程；返回钳位后的值。 */
  setPitchRangeFromPeak(peak: number): number {
    this.calib.pitchRange = clamp(Math.abs(peak), this.cfg.pitchRangeMin, this.cfg.pitchRangeMax);
    return this.calib.pitchRange;
  }

  getCalibration(): Required<Calibration> {
    return { ...this.calib };
  }

  /** 从 localStorage 恢复校准值；老记录没有 pitchRange 时退回 range，行为与拆分前一致。 */
  setCalibration(c: Calibration): void {
    this.calib = {
      yawNeutral: c.yawNeutral,
      pitchNeutral: c.pitchNeutral,
      range: clamp(c.range, this.cfg.rangeMin, this.cfg.rangeMax),
      pitchRange: clamp(
        c.pitchRange ?? c.range,
        this.cfg.pitchRangeMin,
        this.cfg.pitchRangeMax,
      ),
    };
  }

  /** 换了个人 / 重新校准前调用 */
  resetSmoothing(): void {
    this.yawS = 0;
    this.pitchS = 0;
    this.hadFace = false;
    this.nodSince = null;
    this.blinkSince = null;
    this.jawSince = null;
    this.nodArmed = true;
    this.blinkArmed = true;
    this.jawArmed = true;
  }

  update(f: RawFrame): UpdateResult {
    const cfg = this.cfg;

    if (!f.present) {
      return {
        state: { cursorX: 0, confirm: false, pause: false },
        events: [],
      };
    }

    // 重新捕获人脸时直接对齐，避免从 0 慢慢爬上来
    if (!this.hadFace) {
      this.yawS = f.yaw;
      this.pitchS = f.pitch;
      this.hadFace = true;
    }

    this.yawS = cfg.emaAlpha * f.yaw + (1 - cfg.emaAlpha) * this.yawS;
    this.pitchS = cfg.emaAlpha * f.pitch + (1 - cfg.emaAlpha) * this.pitchS;

    const dyaw = this.yawS - this.calib.yawNeutral;
    const dpitch = this.pitchS - this.calib.pitchNeutral;

    // ---------- 光标 ----------
    const cursorX = cursorFromDyaw(dyaw, this.calib.range, cfg);

    const events: GestureEvent[] = [];

    // ---------- 点头 → confirm ----------
    // 用 pitchRange 而不是 range：真人点头幅度只有转头的四分之一左右
    const nodTrig = this.calib.pitchRange * cfg.nodTriggerRatio;
    const nodRearm = this.calib.pitchRange * cfg.nodRearmRatio;
    if (dpitch > nodTrig) {
      if (this.nodArmed) {
        if (this.nodSince === null) this.nodSince = f.t;
        if (
          f.t - this.nodSince >= cfg.nodHoldMs &&
          f.t - this.lastNod >= cfg.nodCooldownMs
        ) {
          events.push('confirm');
          this.lastNod = f.t;
          this.nodArmed = false;
          this.nodSince = null;
        }
      }
    } else {
      this.nodSince = null;
      if (dpitch < nodRearm) this.nodArmed = true;
    }

    // ---------- 双眼眨眼 → confirm ----------
    const blink = Math.min(f.blinkL, f.blinkR);
    if (blink > cfg.blinkTrigger) {
      if (this.blinkArmed) {
        if (this.blinkSince === null) this.blinkSince = f.t;
        if (
          f.t - this.blinkSince >= cfg.blinkHoldMs &&
          f.t - this.lastBlink >= cfg.blinkCooldownMs
        ) {
          events.push('confirm');
          this.lastBlink = f.t;
          this.blinkArmed = false;
          this.blinkSince = null;
        }
      }
    } else {
      this.blinkSince = null;
      if (blink < cfg.blinkRearm) this.blinkArmed = true;
    }

    // ---------- 张嘴 → pause ----------
    if (f.jaw > cfg.jawTrigger) {
      if (this.jawArmed) {
        if (this.jawSince === null) this.jawSince = f.t;
        if (
          f.t - this.jawSince >= cfg.jawHoldMs &&
          f.t - this.lastJaw >= cfg.jawCooldownMs
        ) {
          events.push('pause');
          this.lastJaw = f.t;
          this.jawArmed = false;
          this.jawSince = null;
        }
      }
    } else {
      this.jawSince = null;
      if (f.jaw < cfg.jawRearm) this.jawArmed = true;
    }

    // 同一帧点头和眨眼都触发时，confirm 只算一次
    const unique = Array.from(new Set(events));

    return {
      state: {
        cursorX,
        confirm: unique.includes('confirm'),
        pause: unique.includes('pause'),
      },
      events: unique,
    };
  }
}
