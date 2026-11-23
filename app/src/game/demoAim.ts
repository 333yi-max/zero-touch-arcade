import { clamp } from '../input/config';
import type { Star, StarGameState } from './starGame';

/**
 * 演示模式的辅助瞄准：纯函数，可整局模拟。
 *
 * - 目标 = 当前最靠近挡板的星星，往它慢慢 lerp（每帧 ≤ 0.08，帧率无关）。
 * - 叠加轻微摆动，看起来像真人在控制。
 * - 每颗星的 sin-hash 决定它是不是「故意漏掉的」：hash 超过阈值的星，
 *   瞄准点偏到接不住的位置 —— 不 100% 作弊，但每局只漏固定那么几颗。
 */

export const AIM_LERP = 0.07;
export const AIM_WOBBLE_AMPLITUDE = 0.025;
export const AIM_WOBBLE_PERIOD_MS = 470;
/** 高于这个 hash 值的星故意漏掉。 */
export const AIM_SLIP_THRESHOLD = 0.88;
/** 故意漏掉的偏移量（cursorX 单位）：×332 约 120px，大于 75px 的接住窗口。 */
export const AIM_SLIP_OFFSET = 0.36;

/** 确定性 sin-hash：同一颗星永远得到同一个值，demo 每一局可复现。 */
export function slipFor(starId: number): number {
  const x = Math.sin(starId * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export interface DemoAimInput {
  /** 积分器的值（不含摆动），由调用方（游戏循环）持有并逐帧回传。 */
  prev: number;
  state: StarGameState;
  timeMs: number;
}

export interface DemoAimOutput {
  /** 这一帧真正喂给游戏的 cursorX（积分值 + 摆动）。 */
  cursorX: number;
  /** 下一帧的积分器值：摆动只叠在输出上，绝不回灌进积分器。 */
  next: number;
}

export function nearestStar(stars: readonly Star[]): Star | null {
  let best: Star | null = null;
  for (const star of stars) {
    if (star.y > (best?.y ?? Number.NEGATIVE_INFINITY)) best = star;
  }
  return best;
}

/**
 * 一帧瞄准：积分器从 prev 向目标星的位置慢慢逼近（每帧 ≤ 0.08），
 * 输出再叠一个轻微摆动。prev 必须由调用方持续回传，模拟里也同样逐帧积分。
 */
export function demoAimCursor({ prev, state, timeMs }: DemoAimInput): DemoAimOutput {
  const star = nearestStar(state.stars);
  let targetX = 400;
  if (star) {
    targetX = star.x;
    if (slipFor(star.id) > AIM_SLIP_THRESHOLD) {
      // 故意失手：把瞄准点往场地中央推 —— 朝边缘偏会被 clamp 吃掉，
      // 推中央则所有位置（含边缘星）都能拉开 >75px 的接住窗口。
      const side = star.x < 400 ? 1 : -1;
      targetX += side * AIM_SLIP_OFFSET * 332;
    }
  }
  const desired = clamp((targetX - 400) / 332, -1, 1);
  const next = prev + (desired - prev) * AIM_LERP;
  const wobble = AIM_WOBBLE_AMPLITUDE * Math.sin(timeMs / AIM_WOBBLE_PERIOD_MS);
  return { cursorX: clamp(next + wobble, -1, 1), next };
}
