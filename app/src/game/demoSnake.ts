import { clamp } from '../input/config';
import {
  FIELD_HEIGHT,
  FIELD_WIDTH,
  angleDiff,
  type Orb,
  type SnakeGameState,
} from './snakeGame';

/**
 * 演示模式的虚拟转向：朝最近的光球慢慢转向（按环面短边走，穿墙不绕远路），
 * 没有球时朝场地中心绕圈。纯函数，逐帧调用，叠加轻微摆动像真人。
 */

/** 环面有向差：b 相对 a 的短边偏移（可为负）。 */
export function torusSignedDelta(a: number, b: number, size: number): number {
  let d = b - a;
  while (d > size / 2) d -= size;
  while (d < -size / 2) d += size;
  return d;
}

export function nearestOrb(orbs: readonly Orb[], head: { x: number; y: number }): Orb | null {
  let best: Orb | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const orb of orbs) {
    const d = Math.hypot(
      torusSignedDelta(head.x, orb.x, FIELD_WIDTH),
      torusSignedDelta(head.y, orb.y, FIELD_HEIGHT),
    );
    if (d < bestD) {
      bestD = d;
      best = orb;
    }
  }
  return best;
}

export function demoSnakeTurn(_raw: number, state: SnakeGameState, timeMs: number): number {
  const head = state.segments[0];
  let tx = FIELD_WIDTH / 2;
  let ty = FIELD_HEIGHT / 2;
  const orb = nearestOrb(state.orbs, head);
  if (orb) {
    tx = orb.x;
    ty = orb.y;
  }
  const dx = torusSignedDelta(head.x, tx, FIELD_WIDTH);
  const dy = torusSignedDelta(head.y, ty, FIELD_HEIGHT);
  const err = angleDiff(Math.atan2(dy, dx), state.heading);
  const steer = clamp(err * 1.1, -1, 1);
  const wobble = 0.06 * Math.sin(timeMs / 470);
  return clamp(steer + wobble, -1, 1);
}
