import { clamp } from '../input/config';

// ———— 逻辑坐标与规则常量（全部可被单测直接引用）————

export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;
export const PADDLE_WIDTH = 120;
export const PADDLE_HEIGHT = 16;
/** 挡板顶边所在 y；星星落到这一带判定接住。 */
export const PADDLE_Y = 552;
/** 挡板贴边时离画布边缘的空隙。 */
export const PADDLE_EDGE_MARGIN = 8;
export const STAR_RADIUS = 15;
/** 星星出生点的横向留白，保证整颗星都在画布内。 */
export const SPAWN_MARGIN_X = 40;
export const SPAWN_INTERVAL_MS = 600;
export const STAR_SPEED_MIN = 120;
export const STAR_SPEED_MAX = 260;
export const GOLD_EVERY = 8;
export const BASE_POINTS = 10;
export const GOLD_POINTS = 30;
export const COMBO_PER_MULTIPLIER = 5;
export const MAX_MULTIPLIER = 3;
export const START_LIVES = 3;
export const GAME_DURATION_MS = 90_000;
export const COUNTDOWN_MS = 3_000;
/** 单步 dt 上限：切后台再回来不该让星星瞬移一屏。 */
export const MAX_STEP_MS = 100;

export type StarGamePhase = 'ready' | 'countdown' | 'playing' | 'paused' | 'over';
export type GameOverCause = 'lives' | 'time';

export interface Star {
  id: number;
  x: number;
  y: number;
  vy: number;
  gold: boolean;
}

export interface StarGameStats {
  caught: number;
  missed: number;
  total: number;
  maxCombo: number;
  score: number;
}

export interface StarGameInput {
  cursorX: number;
  confirm: boolean;
  pause: boolean;
}

export interface StarGameState {
  phase: StarGamePhase;
  /** 暂停前的相位，恢复时回去。 */
  phaseBeforePause: 'countdown' | 'playing';
  elapsedMs: number;
  countdownMs: number;
  stars: Star[];
  paddleX: number;
  score: number;
  combo: number;
  lives: number;
  spawnTimerMs: number;
  spawnedCount: number;
  nextId: number;
  caught: number;
  missed: number;
  maxCombo: number;
  prevConfirm: boolean;
  prevPause: boolean;
  overCause: GameOverCause | null;
  /** 随机源由调用方注入；测试传固定种子，游戏传 Math.random。 */
  rand: () => number;
  durationMs: number;
}

export type StarGameEvent =
  | {
      type: 'catch';
      id: number;
      gold: boolean;
      base: number;
      multiplier: number;
      combo: number;
      score: number;
      x: number;
      y: number;
    }
  | { type: 'miss'; id: number; comboBefore: number; livesLeft: number; x: number; y: number }
  | { type: 'countdown'; remaining: number }
  | { type: 'phase'; phase: StarGamePhase }
  | { type: 'gameOver'; cause: GameOverCause; stats: StarGameStats };

export interface StarGameOptions {
  rand?: () => number;
  durationMs?: number;
}

export function multiplierFor(combo: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / COMBO_PER_MULTIPLIER));
}

/** cursorX (-1..1) → 挡板中心 x；两端留边，钳到画布内。 */
export function paddleXFromCursor(cursorX: number): number {
  const halfTravel = GAME_WIDTH / 2 - PADDLE_WIDTH / 2 - PADDLE_EDGE_MARGIN;
  return GAME_WIDTH / 2 + clamp(cursorX, -1, 1) * halfTravel;
}

export function statsOf(s: StarGameState): StarGameStats {
  return {
    caught: s.caught,
    missed: s.missed,
    total: s.caught + s.missed,
    maxCombo: s.maxCombo,
    score: s.score,
  };
}

export function createInitialState(options: StarGameOptions = {}): StarGameState {
  return {
    phase: 'ready',
    phaseBeforePause: 'playing',
    elapsedMs: 0,
    countdownMs: 0,
    stars: [],
    paddleX: GAME_WIDTH / 2,
    score: 0,
    combo: 0,
    lives: START_LIVES,
    spawnTimerMs: 0,
    spawnedCount: 0,
    nextId: 1,
    caught: 0,
    missed: 0,
    maxCombo: 0,
    prevConfirm: false,
    prevPause: false,
    overCause: null,
    rand: options.rand ?? Math.random,
    durationMs: options.durationMs ?? GAME_DURATION_MS,
  };
}

function spawnStar(s: StarGameState): Star {
  const star: Star = {
    id: s.nextId,
    x: SPAWN_MARGIN_X + s.rand() * (GAME_WIDTH - SPAWN_MARGIN_X * 2),
    y: -STAR_RADIUS,
    vy: STAR_SPEED_MIN + s.rand() * (STAR_SPEED_MAX - STAR_SPEED_MIN),
    gold: s.spawnedCount % GOLD_EVERY === 0,
  };
  s.nextId += 1;
  return star;
}

function caughtBy(star: Star, paddleX: number): boolean {
  const vertical = star.y + STAR_RADIUS >= PADDLE_Y && star.y - STAR_RADIUS <= PADDLE_Y + PADDLE_HEIGHT;
  return vertical && Math.abs(star.x - paddleX) <= PADDLE_WIDTH / 2 + STAR_RADIUS;
}

/**
 * 纯函数推进一帧。时间只来自 dtMs（调用方传 RAF 间隔），
 * 逻辑里没有任何 Date.now / performance.now —— node 里可以整局重放。
 */
export function step(
  s: StarGameState,
  input: StarGameInput,
  dtMs: number,
): { state: StarGameState; events: StarGameEvent[] } {
  const dt = clamp(dtMs, 0, MAX_STEP_MS);
  const confirmEdge = input.confirm && !s.prevConfirm;
  const pauseEdge = input.pause && !s.prevPause;

  const st: StarGameState = {
    ...s,
    prevConfirm: input.confirm,
    prevPause: input.pause,
    // 挡板任何相位都跟手：倒计时里就能看到自己控制的挡板
    paddleX: paddleXFromCursor(input.cursorX),
  };
  const events: StarGameEvent[] = [];

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
      if (pauseEdge) {
        st.phaseBeforePause = 'countdown';
        st.phase = 'paused';
        events.push({ type: 'phase', phase: 'paused' });
        return { state: st, events };
      }
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

    case 'paused': {
      // 张嘴再触发一次，或点头/眨眼，都恢复；恢复用的 confirm 不作用于游戏内
      if (pauseEdge || confirmEdge) {
        st.phase = st.phaseBeforePause;
        events.push({ type: 'phase', phase: st.phase });
      }
      return { state: st, events };
    }

    case 'playing': {
      if (pauseEdge) {
        st.phaseBeforePause = 'playing';
        st.phase = 'paused';
        events.push({ type: 'phase', phase: 'paused' });
        return { state: st, events };
      }

      st.elapsedMs += dt;
      if (st.elapsedMs >= st.durationMs) {
        st.phase = 'over';
        st.overCause = 'time';
        events.push({ type: 'gameOver', cause: 'time', stats: statsOf(st) });
        return { state: st, events };
      }

      st.spawnTimerMs += dt;
      while (st.spawnTimerMs >= SPAWN_INTERVAL_MS) {
        st.spawnTimerMs -= SPAWN_INTERVAL_MS;
        st.spawnedCount += 1;
        st.stars = [...st.stars, spawnStar(st)];
      }

      const kept: Star[] = [];
      for (const star of st.stars) {
        const moving = { ...star, y: star.y + (star.vy * dt) / 1000 };
        if (caughtBy(moving, st.paddleX)) {
          st.caught += 1;
          st.combo += 1;
          if (st.combo > st.maxCombo) st.maxCombo = st.combo;
          const multiplier = multiplierFor(st.combo);
          const base = star.gold ? GOLD_POINTS : BASE_POINTS;
          st.score += base * multiplier;
          events.push({
            type: 'catch',
            id: star.id,
            gold: star.gold,
            base,
            multiplier,
            combo: st.combo,
            score: st.score,
            x: star.x,
            y: PADDLE_Y,
          });
        } else if (moving.y - STAR_RADIUS > GAME_HEIGHT) {
          st.missed += 1;
          const comboBefore = st.combo;
          st.combo = 0;
          st.lives -= 1;
          events.push({
            type: 'miss',
            id: star.id,
            comboBefore,
            livesLeft: st.lives,
            x: star.x,
            y: GAME_HEIGHT,
          });
          if (st.lives <= 0) {
            st.phase = 'over';
            st.overCause = 'lives';
            events.push({ type: 'gameOver', cause: 'lives', stats: statsOf(st) });
            break;
          }
        } else {
          kept.push(moving);
        }
      }
      st.stars = kept;
      return { state: st, events };
    }

    case 'over':
      return { state: st, events };
  }
}
