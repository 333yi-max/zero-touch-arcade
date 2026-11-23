import type { CandleGameState } from './candleGame';

/**
 * 吹蜡烛的演示玩家：整体接管输入。
 * ready 相位延迟 1.5 秒自己点头开局；playing 后按 500ms 吹 / 600ms 停的
 * 节拍「呼吸」，净进度每周期 +200ms，约 2.2 秒吹灭一支、11 秒吹完全部，
 * 全程连吹、以满分结束 —— ScriptedSource 没有嘴部脉冲，不能走手势管线。
 */

export interface DemoCandleMemory {
  /** 上一次点头的时间戳，用来凑确认边沿。 */
  pulsedAt: number;
}

export const DEMO_CANDLE_START: DemoCandleMemory = { pulsedAt: -1e9 };

const START_DELAY_MS = 1500;
const BLOW_CYCLE_MS = 1100;
const BLOW_DUTY_MS = 500;

export function demoCandleInput(
  prev: DemoCandleMemory,
  state: CandleGameState,
  timeMs: number,
): {
  confirm: boolean;
  blow: boolean;
  next: DemoCandleMemory;
} {
  if (state.phase === 'ready') {
    const confirm = timeMs - prev.pulsedAt > START_DELAY_MS;
    return {
      confirm,
      blow: false,
      next: { pulsedAt: confirm ? timeMs : prev.pulsedAt },
    };
  }
  const blow = state.phase === 'playing' && timeMs % BLOW_CYCLE_MS < BLOW_DUTY_MS;
  return { confirm: false, blow, next: prev };
}
