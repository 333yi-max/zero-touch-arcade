import { clamp, DEFAULT_CONFIG, type GestureConfig } from './config';
import type {
  Calibration,
  GestureEvent,
  RawFrame,
  UpdateResult,
} from './types';

/**
 * 手势引擎：纯逻辑，不依赖 DOM / 摄像头。
 * 输入 RawFrame，输出 InputState 和边沿事件。
 *
 * 设计原则：
 * 1. 所有阈值相对“校准后的量程”，不是绝对值。
 * 2. 每个手势触发后必须回中/释放才能再次触发，避免连发。
 * 3. 点头和眨眼都映射到 confirm；同一帧只触发一次。
 */
export class GestureEngine {
  private cfg: GestureConfig;
  private calib: Calibration = {
    yawNeutral: 0,
    pitchNeutral: 0,
    range: 0.18,
  };

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
    this.calib.yawNeutral = y / samples.length;
    this.calib.pitchNeutral = p / samples.length;
  }

  /**
   * 用左右转头的最大偏移设置量程。
   * 活动范围小的人会被放大到 rangeMin，仍能走满全场。
   */
  setRangeFromOffsets(leftOffset: number, rightOffset: number): number {
    const raw = Math.max(Math.abs(leftOffset), Math.abs(rightOffset));
    this.calib.range = clamp(raw, this.cfg.rangeMin, this.cfg.rangeMax);
    return this.calib.range;
  }

  getCalibration(): Calibration {
    return { ...this.calib };
  }

  /** 从 localStorage 恢复校准值 */
  setCalibration(c: Calibration): void {
    this.calib = {
      yawNeutral: c.yawNeutral,
      pitchNeutral: c.pitchNeutral,
      range: clamp(c.range, this.cfg.rangeMin, this.cfg.rangeMax),
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
    let cursorX = 0;
    if (Math.abs(dyaw) > cfg.deadzone) {
      const span = Math.max(1e-6, this.calib.range - cfg.deadzone);
      const magnitude = Math.min(1, (Math.abs(dyaw) - cfg.deadzone) / span);
      cursorX = clamp(Math.sign(dyaw) * magnitude * cfg.mirrorX, -1, 1);
    }

    const events: GestureEvent[] = [];

    // ---------- 点头 → confirm ----------
    const nodTrig = this.calib.range * cfg.nodTriggerRatio;
    const nodRearm = this.calib.range * cfg.nodRearmRatio;
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
