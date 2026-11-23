import { clamp } from '../input/config';

// ———— 打地鼠常量 ————

export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;
export const GRID_COLS = 3;
export const GRID_ROWS = 3;
export const HOLE_COUNT = GRID_COLS * GRID_ROWS;
export const HOLE_RADIUS = 52;
export const COUNTDOWN_MS = 3_000;
export const GAME_DURATION_MS = 60_000;
export const TARGET_HITS = 25;
export const MAX_MISSES = 8;
export const MOLE_LIFE_MIN_MS = 800;
export const MOLE_LIFE_MAX_MS = 1_400;
export const SPAWN_INTERVAL_MS = 850;
export const BASE_POINTS = 10;
export const GOLD_POINTS = 30;
export const GOLD_EVERY = 10;
export const MULT_CAP = 3;
/** 单步 dt 上限：切后台再回来不该把整局跳过去。 */
export const MAX_STEP_MS = 100;

/**
 * 洞心坐标，按「行优先蛇形路径」排序：第 0 行左→右、第 1 行右→左、第 2 行左→右。
 * 一维准星 cursorX ∈ [-1,1] 沿这条路径连续滑动，比 3×3 行列双坐标更适合单轴输入。
 */
export const HOLE_POSITIONS: readonly [number, number][] = [
  [250, 190],
  [400, 190],
  [550, 190],
  [550, 300],
  [400, 300],
  [250, 300],
  [250, 410],
  [400, 410],
  [550, 410],
];

export type WhackPhase = 'ready' | 'countdown' | 'playing' | 'paused' | 'over';
export type WhackOverCause = 'hits' | 'misses' | 'time';

export interface WhackMole {
  visible: boolean;
  gold: boolean;
  /** 这一只的总寿命，出洞动画用它算进度。 */
  lifeMs: number;
  leftMs: number;
}

export interface WhackGameState {
  phase: WhackPhase;
  phaseBeforePause: 'countdown' | 'playing';
  countdownMs: number;
  elapsedMs: number;
  durationMs: number;
  moles: WhackMole[];
  spawnTimerMs: number;
  spawnCount: number;
  hits: number;
  misses: number;
  score: number;
  combo: number;
  maxCombo: number;
  prevConfirm: boolean;
  prevPause: boolean;
  /** 准星当前一维位置（-1..1），step 从 input 抄进状态，渲染器只读状态。 */
  cursorX: number;
  overCause: WhackOverCause | null;
  rand: () => number;
}

export interface WhackGameInput {
  cursorX: number;
  confirm: boolean;
  pause: boolean;
}

export interface WhackGameStats {
  score: number;
  hits: number;
  misses: number;
  maxCombo: number;
}

export type WhackGameEvent =
  | { type: 'phase'; phase: WhackPhase }
  | { type: 'countdown'; remaining: number }
  | { type: 'spawn'; hole: number; gold: boolean }
  | { type: 'hit'; hole: number; gold: boolean; points: number; combo: number; multiplier: number }
  | { type: 'whiff'; hole: number }
  | { type: 'retreat'; hole: number }
  | { type: 'gameOver'; stats: WhackGameStats };

export interface WhackGameOptions {
  /** 测试可覆盖成更短；默认 60 秒。 */
  durationMs?: number;
  rand?: () => number;
}

export function multiplierFor(combo: number): number {
  return Math.min(MULT_CAP, 1 + Math.floor(combo / 5));
}

/** 路径参数 t ∈ [0,1] → 画布坐标：节点间线性插值，节点 = 蛇形路径上的洞心。 */
export function whackPathPoint(t: number): { x: number; y: number } {
  const clamped = clamp(t, 0, 1);
  const scaled = clamped * (HOLE_COUNT - 1);
  const i = Math.min(HOLE_COUNT - 2, Math.floor(scaled));
  const f = scaled - i;
  const [x0, y0] = HOLE_POSITIONS[i];
  const [x1, y1] = HOLE_POSITIONS[i + 1];
  return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f };
}

/** 一维准星 → 最近洞：cursorX=-1 是路径起点（洞 0），+1 是终点（洞 8）。 */
export function holeIndexForCursor(cursorX: number): number {
  const t = (clamp(cursorX, -1, 1) + 1) / 2;
  return Math.round(t * (HOLE_COUNT - 1));
}

/** 某洞在路径上的准星值：测试与演示 AI 都要用。 */
export function cursorForHole(hole: number): number {
  return -1 + (2 * hole) / (HOLE_COUNT - 1);
}

export function statsOf(s: WhackGameState): WhackGameStats {
  return { score: s.score, hits: s.hits, misses: s.misses, maxCombo: s.maxCombo };
}

function emptyMole(): WhackMole {
  return { visible: false, gold: false, lifeMs: 0, leftMs: 0 };
}

export function createInitialState(options: WhackGameOptions = {}): WhackGameState {
  return {
    phase: 'ready',
    phaseBeforePause: 'playing',
    countdownMs: 0,
    elapsedMs: 0,
    durationMs: options.durationMs ?? GAME_DURATION_MS,
    moles: Array.from({ length: HOLE_COUNT }, emptyMole),
    spawnTimerMs: 600,
    spawnCount: 0,
    hits: 0,
    misses: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    prevConfirm: false,
    prevPause: false,
    cursorX: 0,
    overCause: null,
    rand: options.rand ?? Math.random,
  };
}

/** 纯函数推进一帧；时间只来自 dtMs，逻辑里没有 Date.now / performance.now。 */
export function step(
  s: WhackGameState,
  input: WhackGameInput,
  dtMs: number,
): { state: WhackGameState; events: WhackGameEvent[] } {
  const dt = clamp(dtMs, 0, MAX_STEP_MS);
  const confirmEdge = input.confirm && !s.prevConfirm;
  const pauseEdge = input.pause && !s.prevPause;

  const st: WhackGameState = {
    ...s,
    prevConfirm: input.confirm,
    prevPause: input.pause,
    // 准星任何相位都跟手：倒计时里就能看到它滑
    cursorX: input.cursorX,
  };
  const events: WhackGameEvent[] = [];

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
      // 张嘴再触发一次，或点头，都恢复；恢复用的 confirm 不作用于游戏内
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

      // 下面会改 moles 的内部字段：先整层拷贝，不污染调用方手里的旧状态
      st.moles = st.moles.map((mole) => ({ ...mole }));
      st.elapsedMs += dt;

      // 新地鼠：随机挑一个空洞；全满就顺延到下一拍
      st.spawnTimerMs -= dt;
      while (st.spawnTimerMs <= 0) {
        st.spawnTimerMs += SPAWN_INTERVAL_MS;
        const free = st.moles
          .map((mole, i) => (mole.visible ? -1 : i))
          .filter((i) => i >= 0);
        if (free.length > 0) {
          const hole = free[Math.floor(st.rand() * free.length)];
          st.spawnCount += 1;
          const gold = st.spawnCount % GOLD_EVERY === 0;
          const lifeMs =
            MOLE_LIFE_MIN_MS + st.rand() * (MOLE_LIFE_MAX_MS - MOLE_LIFE_MIN_MS);
          st.moles = st.moles.map((mole, i) =>
            i === hole ? { visible: true, gold, lifeMs, leftMs: lifeMs } : mole,
          );
          events.push({ type: 'spawn', hole, gold });
        }
      }

      // 地鼠缩回 = 漏掉
      for (let i = 0; i < HOLE_COUNT; i += 1) {
        const mole = st.moles[i];
        if (!mole.visible) continue;
        mole.leftMs -= dt;
        if (mole.leftMs <= 0) {
          mole.visible = false;
          st.misses += 1;
          events.push({ type: 'retreat', hole: i });
        }
      }

      // 点头敲最近洞
      if (confirmEdge) {
        const hole = holeIndexForCursor(input.cursorX);
        const mole = st.moles[hole];
        if (mole.visible) {
          const combo = st.combo + 1;
          st.combo = combo;
          st.maxCombo = Math.max(st.maxCombo, combo);
          const multiplier = multiplierFor(combo);
          const points = (mole.gold ? GOLD_POINTS : BASE_POINTS) * multiplier;
          st.score += points;
          st.hits += 1;
          mole.visible = false;
          events.push({
            type: 'hit',
            hole,
            gold: mole.gold,
            points,
            combo,
            multiplier,
          });
        } else {
          st.combo = 0;
          events.push({ type: 'whiff', hole });
        }
      }

      // 三种结束：敲满 / 漏太多 / 时间到
      if (st.hits >= TARGET_HITS) {
        st.phase = 'over';
        st.overCause = 'hits';
      } else if (st.misses >= MAX_MISSES) {
        st.phase = 'over';
        st.overCause = 'misses';
      } else if (st.elapsedMs >= st.durationMs) {
        st.phase = 'over';
        st.overCause = 'time';
      }
      if (st.phase === 'over') {
        events.push({ type: 'phase', phase: 'over' }, { type: 'gameOver', stats: statsOf(st) });
      }
      return { state: st, events };
    }

    case 'over':
      return { state: st, events };
  }
}
