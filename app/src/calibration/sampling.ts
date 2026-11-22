/**
 * 校准用的统计量。全是纯函数，空数组一律抛错——调用方（sequencer）负责保证窗口填满，
 * 抛错意味着逻辑写错了，不该被静默吞掉变成一个 0。
 */

export function mean(values: readonly number[]): number {
  if (values.length === 0) throw new Error('mean: empty');
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** 偶数个取中间两个的平均。 */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('median: empty');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * 先按幅度取最大的 k 个，再对这 k 个（带符号）求中位数。
 *
 * 为什么不直接用整窗中位数：转头那 30 帧里混着转过去的过渡段，整窗中位数会被拉低；
 * 而点头是动态动作，大半时间头在回中位，整窗中位数会 ≈ 0。
 * 为什么不用 max：跟踪抖跳出来的单帧 0.9 会把量程顶到钳位上限，等于校准失败。
 */
export function medianOfLargest(values: readonly number[], k: number): number {
  if (values.length === 0) throw new Error('medianOfLargest: empty');
  const top = [...values].sort((a, b) => Math.abs(b) - Math.abs(a)).slice(0, Math.max(1, k));
  return median(top);
}

export function spread(values: readonly number[]): number {
  if (values.length === 0) throw new Error('spread: empty');
  let lo = values[0]!;
  let hi = values[0]!;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return hi - lo;
}

/** 「定住了没」：极差在限内才算数。 */
export function isStable(values: readonly number[], maxSpread: number): boolean {
  if (values.length === 0) return false;
  return spread(values) <= maxSpread;
}

/** 左右两步该给出反号的偏移；同向说明人转了两次同一边。 */
export function oppositeSign(a: number, b: number): boolean {
  return a * b < 0;
}

export function meetsMin(magnitude: number, min: number): boolean {
  return Number.isFinite(magnitude) && magnitude >= min;
}

export function isPlausible(magnitude: number, limit: number): boolean {
  return Number.isFinite(magnitude) && magnitude <= limit;
}
