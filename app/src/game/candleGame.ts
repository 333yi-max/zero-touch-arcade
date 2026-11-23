import { clamp } from '../input/config';

// ———— 逻辑坐标与规则常量（全部可被单测直接引用）————

export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;

export const CANDLE_COUNT = 5;
/** 吹灭一支所需的累计张嘴时长。 */
export const BLOW_MS = 400;
/** 不张嘴时进度以一半速率衰减：持续张嘴最快，断续吹也吹得灭。 */
export const BLOW_DECAY_RATE = 0.5;
export const CANDLE_POINTS = 20;
/** 两次吹灭间隔小于 2 秒 = 连吹奖励。 */
export const CHAIN_WINDOW_MS = 2_000;
export const CHAIN_BONUS = 10;
export const GAME_DURATION_MS = 60_000;
export const COUNTDOWN_MS = 3_000;
/** 单步 dt 上限：切后台再回来不该让蜡烛瞬间吹灭。 */
export const MAX_STEP_MS = 100;

export type CandlePhase = 'ready' | 'countdown' | 'playing' | 'over';
export type CandleOverCause = 'done' | 'time';

export interface CandleGameState {
  phase: CandlePhase;
  countdownMs: number;
  elapsedMs: number;
  durationMs: number;
  /** true = 还亮着。从左边数第一支亮着的就是当前目标。 */
  candles: boolean[];
  /** 当前蜡烛的累计吹气进度（毫秒）。 */
  blowMs: number;
  litCount: number;
  extinguished: number;
  /** 连吹奖励拿到过几次。 */
  chained: number;
  /** 上一支吹灭时的 elapsedMs；开局前设为 -CHAIN_WINDOW_MS，第一支永远没奖励。 */
  lastExtinguishMs: number;
  score: number;
  prevConfirm: boolean;
  overCause: CandleOverCause | null;
}

export interface CandleGameInput {
  confirm: boolean;
  blow: boolean;
}

export interface CandleGameStats {
  score: number;
  extinguished: number;
  chained: number;
}

export type CandleGameEvent =
  | { type: 'phase'; phase: CandlePhase }
  | { type: 'countdown'; remaining: number }
  | {
      type: 'extinguish';
      index: number;
      points: number;
      bonus: number;
      score: number;
      chained: boolean;
    }
  | { type: 'gameOver'; cause: CandleOverCause; stats: CandleGameStats };

export interface CandleGameOptions {
  durationMs?: number;
}

export function statsOf(s: CandleGameState): CandleGameStats {
  return { score: s.score, extinguished: s.extinguished, chained: s.chained };
}

export function createInitialState(options: CandleGameOptions = {}): CandleGameState {
  return {
    phase: 'ready',
    countdownMs: 0,
    elapsedMs: 0,
    durationMs: options.durationMs ?? GAME_DURATION_MS,
    candles: Array.from({ length: CANDLE_COUNT }, () => true),
    blowMs: 0,
    litCount: CANDLE_COUNT,
    extinguished: 0,
    chained: 0,
    lastExtinguishMs: -CHAIN_WINDOW_MS,
    score: 0,
    prevConfirm: false,
    overCause: null,
  };
}

/**
 * 纯函数推进一帧。时间只来自 dtMs，逻辑里没有任何 Date.now / performance.now。
 * 吹蜡烛没有暂停：嘴（blow）就是主操作，不能兼职当暂停键；60 秒很短。
 */
export function step(
  s: CandleGameState,
  input: CandleGameInput,
  dtMs: number,
): { state: CandleGameState; events: CandleGameEvent[] } {
  const dt = clamp(dtMs, 0, MAX_STEP_MS);
  const confirmEdge = input.confirm && !s.prevConfirm;

  const st: CandleGameState = { ...s, prevConfirm: input.confirm };
  const events: CandleGameEvent[] = [];

  switch (st.phase) {
    case 'ready': {
      if (confirmEdge) {
        st.phase = 'countdown';
        st.countdownMs = COUNTDOWN_MS;
        events.push({ type: 'phase', phase: 'countdown' }, { type: 'countdown', remaining: 3 });
      }
      return { state: st, events };
    }

    case 'countdown': {
      const before = Math.ceil(st.countdownMs / 1000);
      st.countdownMs -= dt;
      const after = Math.ceil(Math.max(st.countdownMs, 0) / 1000);
      if (after < before) events.push({ type: 'countdown', remaining: after });
      if (st.countdownMs <= 0) {
        st.phase = 'playing';
        events.push({ type: 'phase', phase: 'playing' });
      }
      return { state: st, events };
    }

    case 'playing': {
      st.elapsedMs += dt;
      if (st.elapsedMs >= st.durationMs) {
        st.phase = 'over';
        st.overCause = 'time';
        events.push({ type: 'gameOver', cause: 'time', stats: statsOf(st) });
        return { state: st, events };
      }

      st.blowMs += input.blow ? dt : -dt * BLOW_DECAY_RATE;
      st.blowMs = clamp(st.blowMs, 0, BLOW_MS);

      if (st.blowMs >= BLOW_MS) {
        const index = st.candles.findIndex((lit) => lit);
        if (index >= 0) {
          st.candles = st.candles.map((lit, i) => (i === index ? false : lit));
          st.litCount -= 1;
          st.extinguished += 1;
          st.blowMs = 0;
          const chained = st.elapsedMs - st.lastExtinguishMs <= CHAIN_WINDOW_MS;
          st.lastExtinguishMs = st.elapsedMs;
          const points = CANDLE_POINTS;
          const bonus = chained ? CHAIN_BONUS : 0;
          if (chained) st.chained += 1;
          st.score += points + bonus;
          events.push({
            type: 'extinguish',
            index,
            points,
            bonus,
            score: st.score,
            chained,
          });
          if (st.litCount === 0) {
            st.phase = 'over';
            st.overCause = 'done';
            events.push({ type: 'gameOver', cause: 'done', stats: statsOf(st) });
          }
        }
      }
      return { state: st, events };
    }

    case 'over':
      return { state: st, events };
  }
}
