import { clamp } from '../input/config';

// ———— 节奏常量 ————

export const BPM = 60;
export const BEAT_INTERVAL_MS = 60_000 / BPM;
export const BEATS = 16;
/** 判定窗口：与拍点的毫秒差。 */
export const PERFECT_MS = 120;
export const GOOD_MS = 250;
export const PERFECT_POINTS = 100;
export const GOOD_POINTS = 60;
/** 收缩环提前量：环在拍点前这么久开始收缩，与目标圈重合的一刻就是拍点。 */
export const LEAD_MS = 1200;
export const COUNTDOWN_MS = 3_000;
/** 单步 dt 上限：切后台再回来不该把整局跳过去。 */
export const MAX_STEP_MS = 100;

export type RhythmPhase = 'ready' | 'countdown' | 'playing' | 'over';
export type JudgeResult = 'perfect' | 'good' | 'miss';
export type Rating = 'S' | 'A' | 'B' | 'C';

export interface RhythmGameStats {
  results: JudgeResult[];
  score: number;
  maxCombo: number;
  /** 判定到的比例（perfect+good）/总拍数，0..1。 */
  accuracy: number;
  rating: Rating;
}

export interface RhythmGameInput {
  confirm: boolean;
}

export interface RhythmGameState {
  phase: RhythmPhase;
  countdownMs: number;
  /** 进入 playing 后的累计毫秒；拍点 = beatAtMs(i)。 */
  elapsedMs: number;
  /** 下一个待判定的拍子（0-based），等于 results.length。 */
  beatIndex: number;
  /** 下一个要发 beat 事件的拍子。判定早于拍点时会先推进 beatIndex，所以单独一个游标。 */
  beatTick: number;
  results: JudgeResult[];
  score: number;
  /** 连击：只数 perfect，good / miss 清零。 */
  combo: number;
  maxCombo: number;
  prevConfirm: boolean;
  /** 游玩时长上限（默认 16 拍自然结束；测试可覆盖成更短）。 */
  durationMs: number;
}

export type RhythmGameEvent =
  | { type: 'beat'; index: number }
  | { type: 'judge'; beat: number; result: JudgeResult; score: number; combo: number }
  | { type: 'countdown'; remaining: number }
  | { type: 'phase'; phase: RhythmPhase }
  | { type: 'gameOver'; stats: RhythmGameStats };

export interface RhythmGameOptions {
  durationMs?: number;
}

/** 第 i 拍（0-based）的拍点时刻。 */
export function beatAtMs(index: number): number {
  return (index + 1) * BEAT_INTERVAL_MS;
}

export function accuracyOf(results: readonly JudgeResult[]): number {
  if (results.length === 0) return 0;
  let hit = 0;
  for (const r of results) if (r !== 'miss') hit += 1;
  return hit / results.length;
}

export function ratingFor(results: readonly JudgeResult[]): Rating {
  const acc = accuracyOf(results);
  if (acc >= 0.95) return 'S';
  if (acc >= 0.85) return 'A';
  if (acc >= 0.7) return 'B';
  return 'C';
}

export function statsOf(s: RhythmGameState): RhythmGameStats {
  const results = [...s.results];
  return {
    results,
    score: s.score,
    maxCombo: s.maxCombo,
    accuracy: accuracyOf(results),
    rating: ratingFor(results),
  };
}

export function createInitialState(options: RhythmGameOptions = {}): RhythmGameState {
  return {
    phase: 'ready',
    countdownMs: 0,
    elapsedMs: 0,
    beatIndex: 0,
    beatTick: 0,
    results: [],
    score: 0,
    combo: 0,
    maxCombo: 0,
    prevConfirm: false,
    durationMs: options.durationMs ?? BEATS * BEAT_INTERVAL_MS + GOOD_MS + 400,
  };
}

function judgeAt(
  st: RhythmGameState,
  events: RhythmGameEvent[],
  result: JudgeResult,
): void {
  const beat = st.beatIndex;
  // 新数组而不是 push：st 是从 s 浅拷贝来的，共享同一个 results 引用会污染旧状态
  st.results = [...st.results, result];
  st.beatIndex += 1;
  if (result === 'perfect') {
    st.combo += 1;
    if (st.combo > st.maxCombo) st.maxCombo = st.combo;
    st.score += PERFECT_POINTS;
  } else {
    st.combo = 0;
    if (result === 'good') st.score += GOOD_POINTS;
  }
  events.push({ type: 'judge', beat, result, score: st.score, combo: st.combo });
}

/**
 * 纯函数推进一帧。时间只来自 dtMs，逻辑里没有任何 Date.now / performance.now。
 * 判定规则：confirm 上升沿对着「下一个未判定的拍子」算毫秒差，
 * ≤PERFECT_MS perfect、≤GOOD_MS good、更早就忽略；拍点过后 GOOD_MS 还没确认自动记 miss。
 * 每拍只判定一次。
 */
export function step(
  s: RhythmGameState,
  input: RhythmGameInput,
  dtMs: number,
): { state: RhythmGameState; events: RhythmGameEvent[] } {
  const dt = clamp(dtMs, 0, MAX_STEP_MS);
  const confirmEdge = input.confirm && !s.prevConfirm;

  const st: RhythmGameState = { ...s, prevConfirm: input.confirm };
  const events: RhythmGameEvent[] = [];

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

      // 时长上限（测试覆盖用）：没判完的拍子全部按 miss 记，保证 results 恒为 16 条
      if (st.elapsedMs >= st.durationMs) {
        while (st.beatIndex < BEATS) judgeAt(st, events, 'miss');
        st.phase = 'over';
        events.push({ type: 'gameOver', stats: statsOf(st) });
        return { state: st, events };
      }

      // 拍点事件：先于判定（判定会推进 beatIndex，但 beat 声不能因此漏掉）
      while (st.beatTick < BEATS && st.elapsedMs >= beatAtMs(st.beatTick)) {
        events.push({ type: 'beat', index: st.beatTick });
        st.beatTick += 1;
      }

      if (confirmEdge && st.beatIndex < BEATS) {
        const offset = st.elapsedMs - beatAtMs(st.beatIndex);
        const abs = Math.abs(offset);
        if (abs <= PERFECT_MS) judgeAt(st, events, 'perfect');
        else if (abs <= GOOD_MS) judgeAt(st, events, 'good');
        // 更早就忽略：这一下「不算」，miss 由拍子过后自动记
      }

      // 拍点过了 GOOD_MS 还没确认 → 自动 miss（dt≤100 时最多跨一拍，while 保平安）
      while (
        st.beatIndex < BEATS &&
        st.elapsedMs > beatAtMs(st.beatIndex) + GOOD_MS
      ) {
        judgeAt(st, events, 'miss');
      }

      if (st.beatIndex >= BEATS) {
        st.phase = 'over';
        events.push({ type: 'gameOver', stats: statsOf(st) });
      }
      return { state: st, events };
    }

    case 'over':
      return { state: st, events };
  }
}
