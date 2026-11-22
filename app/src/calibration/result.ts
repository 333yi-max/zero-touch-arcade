import { DEFAULT_CONFIG, clamp, type GestureConfig } from '../input/config';
import { DEFAULT_CALIBRATION } from '../input/gestureEngine';
import type { Calibration } from '../input/types';
import type { Measurements } from './steps';

/**
 * 测量值 → 最终量程，唯一一条通路。钳位、取小边、灵敏度都在这里做一次，
 * sequencer 和 UI 只负责把数攒齐、把结果显示出来，不再各自钳一遍。
 */
export type CalibrationResult = {
  yawNeutral: number;
  pitchNeutral: number;
  /** 光标量程（钳在 rangeMin~rangeMax） */
  yawRange: number;
  /** 点头量程（钳在 pitchRangeMin~pitchRangeMax） */
  pitchRange: number;
  /** 1~100：yawRange 相对上限的比例，越小表示给活动范围小的人放得越开 */
  sensitivity: number;
  /** 舒适幅度超过 rangeMax，被压下来 → UI 要显示「已自动压缩灵敏度」 */
  yawClampedToMax: boolean;
  /** 幅度小于 rangeMin，被抬上去 → 「已自动放大灵敏度」 */
  yawClampedToMin: boolean;
  /** 点头幅度被 pitchRangeMax 截住 */
  pitchCapped: boolean;
};

type Cfg = Pick<
  GestureConfig,
  'rangeMin' | 'rangeMax' | 'pitchRangeMin' | 'pitchRangeMax'
>;

function sensitivityOf(yawRange: number, cfg: Cfg): number {
  return clamp(Math.round((yawRange / cfg.rangeMax) * 100), 1, 100);
}

export function buildCalibration(
  m: Measurements,
  cfg: Cfg = DEFAULT_CONFIG,
): CalibrationResult {
  if (m.leftOffset === null || m.rightOffset === null) {
    throw new Error('buildCalibration: 左右转头还没采到');
  }
  if (m.nodPeakOffset === null) {
    throw new Error('buildCalibration: 点头还没采到');
  }

  // 取两边都能走满的较小值：一边转不到位，光标就永远到不了那一侧的边缘
  const rawYaw = Math.min(Math.abs(m.leftOffset), Math.abs(m.rightOffset));
  const yawRange = clamp(rawYaw, cfg.rangeMin, cfg.rangeMax);
  const pitchRange = clamp(m.nodPeakOffset, cfg.pitchRangeMin, cfg.pitchRangeMax);

  return {
    yawNeutral: m.yawNeutral,
    pitchNeutral: m.pitchNeutral,
    yawRange,
    pitchRange,
    sensitivity: sensitivityOf(yawRange, cfg),
    yawClampedToMax: rawYaw > cfg.rangeMax,
    yawClampedToMin: rawYaw < cfg.rangeMin,
    pitchCapped: m.nodPeakOffset > cfg.pitchRangeMax,
  };
}

/** 「用默认值继续」用的那份：直接引用引擎自带的初始量程，不另写一遍 0.18。 */
export function defaultCalibration(cfg: Cfg = DEFAULT_CONFIG): CalibrationResult {
  const d = DEFAULT_CALIBRATION;
  return {
    yawNeutral: d.yawNeutral,
    pitchNeutral: d.pitchNeutral,
    yawRange: d.range,
    pitchRange: d.pitchRange,
    sensitivity: sensitivityOf(d.range, cfg),
    yawClampedToMax: false,
    yawClampedToMin: false,
    pitchCapped: false,
  };
}

/** 喂给 GestureEngine 的形状。 */
export function toEngineCalibration(r: CalibrationResult): Required<Calibration> {
  return {
    yawNeutral: r.yawNeutral,
    pitchNeutral: r.pitchNeutral,
    range: r.yawRange,
    pitchRange: r.pitchRange,
  };
}
