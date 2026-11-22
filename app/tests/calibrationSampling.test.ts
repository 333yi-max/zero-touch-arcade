import { describe, expect, it } from 'vitest';
import {
  isPlausible,
  isStable,
  meetsMin,
  medianOfLargest,
  mean,
  median,
  oppositeSign,
  spread,
} from '../src/calibration/sampling';

describe('calibration/sampling', () => {
  it('mean 与 median：空数组抛错，偶数个取中间两个的平均', () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(() => mean([])).toThrow();
    expect(() => median([])).toThrow();
  });

  it('medianOfLargest 既躲开过渡段，也不被单帧野值顶飞', () => {
    // 20 帧还在转过去（0.05→0.30 爬升）+ 10 帧到达后的平台 + 两个跟踪抖跳的 0.9 / -0.8
    const ramp = Array.from({ length: 20 }, (_, i) => 0.05 + i * (0.25 / 19));
    const plateau = Array.from({ length: 10 }, () => 0.3);
    const values = [...ramp, ...plateau, 0.9, -0.8];

    expect(medianOfLargest(values, 15)).toBeCloseTo(0.3, 6);
    // 整窗中位数会被过渡段拉低（这里 ≈0.24），max 会直接撞上野值 —— 两种都不该用
    expect(median(values)).toBeLessThan(0.28);
    expect(Math.max(...values.map(Math.abs))).toBe(0.9);
  });

  it('medianOfLargest 保留符号：向左是正、向右是负', () => {
    expect(medianOfLargest([-0.3, -0.31, -0.29, 0.01], 3)).toBeCloseTo(-0.3, 6);
  });

  it('k 大于数组长度时不越界', () => {
    expect(medianOfLargest([0.2, 0.4], 10)).toBeCloseTo(0.3, 6);
  });

  it('spread / isStable：定没定住', () => {
    expect(spread([0.1, 0.14, 0.02])).toBeCloseTo(0.12, 6);
    expect(isStable([0.02, 0.03, 0.01], 0.05)).toBe(true);
    expect(isStable([0.02, 0.09], 0.05)).toBe(false);
    expect(isStable([], 0.05)).toBe(false);
  });

  it('oppositeSign 只在真反号时为真，0 不算', () => {
    expect(oppositeSign(0.3, -0.2)).toBe(true);
    expect(oppositeSign(0.3, 0.2)).toBe(false);
    expect(oppositeSign(0.3, 0)).toBe(false);
  });

  it('meetsMin / isPlausible 对 NaN 一律判不合格', () => {
    expect(meetsMin(Number.NaN, 0.012)).toBe(false);
    expect(isPlausible(Number.NaN, 0.45)).toBe(false);
    expect(isPlausible(0.9, 0.45)).toBe(false);
    expect(meetsMin(0.02, 0.012)).toBe(true);
  });
});
