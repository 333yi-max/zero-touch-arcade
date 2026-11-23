import { clamp } from '../input/config';
import {
  HOLE_COUNT,
  cursorForHole,
  type WhackGameState,
} from './whackGame';

/**
 * 打地鼠的演示玩家：整体接管输入（不只瞄准）。
 * 瞄准朝路径距离最近的可见地鼠滑去；到位后按 350ms 节拍点头，
 * 保证新冒头的地鼠在 0.8 秒最短寿命内必被敲到。
 * ready 相位也自己点头开局，演示全程不用真手势。
 */

export interface DemoWhackMemory {
  cursorX: number;
  /** 上一次点头的时间戳，用来凑确认边沿。 */
  pulsedAt: number;
}

export const DEMO_WHACK_START: DemoWhackMemory = { cursorX: 0, pulsedAt: -1e9 };

const AIM_SPEED = 0.18;
const PULSE_MS = 350;
const CLOSE_EPS = 0.06;
/** 演示开局前的停顿：让「准备好了吗」卡片先露个脸再自己开始。 */
const START_DELAY_MS = 1500;

export function demoWhackInput(
  prev: DemoWhackMemory,
  state: WhackGameState,
  timeMs: number,
): {
  cursorX: number;
  confirm: boolean;
  pause: boolean;
  next: DemoWhackMemory;
} {
  if (state.phase === 'ready') {
    const confirm = timeMs - prev.pulsedAt > START_DELAY_MS;
    return {
      cursorX: 0,
      confirm,
      pause: false,
      next: { cursorX: 0, pulsedAt: confirm ? timeMs : prev.pulsedAt },
    };
  }

  // 找路径距离最近（最省行程）的可见地鼠
  let target: number | null = null;
  let best = Infinity;
  for (let i = 0; i < HOLE_COUNT; i += 1) {
    if (!state.moles[i].visible) continue;
    const c = cursorForHole(i);
    const d = Math.abs(c - prev.cursorX);
    if (d < best) {
      best = d;
      target = c;
    }
  }

  const goal = target ?? 0;
  const cursorX = clamp(prev.cursorX + (goal - prev.cursorX) * AIM_SPEED, -1, 1);
  const close = target !== null && Math.abs(cursorX - goal) < CLOSE_EPS;
  const confirm = close && timeMs - prev.pulsedAt > PULSE_MS;

  return {
    cursorX,
    confirm,
    pause: false,
    next: { cursorX, pulsedAt: confirm ? timeMs : prev.pulsedAt },
  };
}
