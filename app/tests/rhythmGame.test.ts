import { describe, expect, it } from 'vitest';
import {
  BEATS,
  BEAT_INTERVAL_MS,
  GOOD_MS,
  GOOD_POINTS,
  PERFECT_MS,
  PERFECT_POINTS,
  beatAtMs,
  createInitialState,
  ratingFor,
  step,
  type JudgeResult,
  type RhythmGameEvent,
  type RhythmGameInput,
  type RhythmGameState,
} from '../src/game/rhythmGame';

const IDLE: RhythmGameInput = { confirm: false };

function play(
  s: RhythmGameState,
  input: RhythmGameInput,
  dt: number,
  times: number,
): { st: RhythmGameState; events: RhythmGameEvent[] } {
  let st = s;
  const events: RhythmGameEvent[] = [];
  for (let i = 0; i < times; i += 1) {
    const r = step(st, input, dt);
    st = r.state;
    events.push(...r.events);
  }
  return { st, events };
}

/** 走完倒计时，进入 playing 且 elapsed = 0。 */
function startPlaying(options: { durationMs?: number } = {}): RhythmGameState {
  let st = createInitialState(options);
  st = step(st, { confirm: true }, 0).state;
  return play(st, IDLE, 100, 30).st;
}

/** 纯空转推进到 elapsed 达到 targetMs（100ms 整步）。 */
function advanceTo(s: RhythmGameState, targetMs: number): RhythmGameState {
  let st = s;
  while (st.elapsedMs < targetMs) {
    st = step(st, IDLE, 100).state;
  }
  return st;
}

function judgeEvents(events: readonly RhythmGameEvent[]) {
  return events.filter((e) => e.type === 'judge');
}

function resultsOf(events: readonly RhythmGameEvent[]): JudgeResult[] {
  return judgeEvents(events).map((e) => (e.type === 'judge' ? e.result : 'miss'));
}

describe('game/rhythmGame', () => {
  it('BPM 60 → 拍点间隔 1000ms，共 16 拍', () => {
    expect(BEAT_INTERVAL_MS).toBe(1000);
    expect(BEATS).toBe(16);
    expect(beatAtMs(0)).toBe(1000);
    expect(beatAtMs(15)).toBe(16000);
  });

  it('ready 阶段 confirm 上升沿进倒计时，报 3/2/1，3 秒后开玩', () => {
    const first = step(createInitialState(), { confirm: true }, 0);
    expect(first.state.phase).toBe('countdown');
    expect(first.events).toContainEqual({ type: 'countdown', remaining: 3 });

    const run = play(first.state, IDLE, 100, 10);
    expect(run.events).toContainEqual({ type: 'countdown', remaining: 2 });
    const done = play(run.st, IDLE, 100, 21);
    expect(done.st.phase).toBe('playing');
    expect(done.st.elapsedMs).toBe(100);
    expect(done.events).toContainEqual({ type: 'phase', phase: 'playing' });
  });

  it('正好拍点确认 = perfect，+100，连击 +1', () => {
    const st = advanceTo(startPlaying(), beatAtMs(0));
    const r = step(st, { confirm: true }, 0);
    expect(r.state.results).toEqual(['perfect']);
    expect(r.state.score).toBe(PERFECT_POINTS);
    expect(r.state.combo).toBe(1);
    expect(r.state.maxCombo).toBe(1);
    expect(r.events).toContainEqual({ type: 'judge', beat: 0, result: 'perfect', score: 100, combo: 1 });
  });

  it('提前 100ms（窗口内）也算 perfect', () => {
    const st = advanceTo(startPlaying(), beatAtMs(0) - 100);
    const r = step(st, { confirm: true }, 0);
    expect(r.state.results).toEqual(['perfect']);
  });

  it('晚 200ms = good，+60，连击清零', () => {
    const st = advanceTo(startPlaying(), beatAtMs(0) + 200);
    const r = step(st, { confirm: true }, 0);
    expect(r.state.results).toEqual(['good']);
    expect(r.state.score).toBe(GOOD_POINTS);
    expect(r.state.combo).toBe(0);
  });

  it('太早的确认「不算」，不扣分也不判定，拍子过后照常 miss', () => {
    const st = advanceTo(startPlaying(), beatAtMs(0) - 500);
    const r = step(st, { confirm: true }, 0);
    expect(r.state.results).toEqual([]);
    expect(r.state.score).toBe(0);
    // 之后不确认，拍点 +250ms 自动记 miss
    const later = play(r.state, IDLE, 100, 10);
    expect(later.st.results).toEqual(['miss']);
    expect(later.st.score).toBe(0);
    expect(later.st.combo).toBe(0);
  });

  it('拍点后 250ms 未确认自动 miss', () => {
    const st = advanceTo(startPlaying(), beatAtMs(0) + GOOD_MS + 50);
    expect(st.results).toEqual(['miss']);
    expect(st.beatIndex).toBe(1);
  });

  it('beat 事件在拍点越过时发出，不受提前判定的影响', () => {
    // 提前 -100ms 判定：beatIndex 先推进，但之后的 beat 声不能漏
    const early = step(advanceTo(startPlaying(), beatAtMs(0) - 100), { confirm: true }, 0);
    expect(early.events).toContainEqual({ type: 'judge', beat: 0, result: 'perfect', score: 100, combo: 1 });
    const crossing = play(early.state, IDLE, 100, 3);
    expect(crossing.events).toContainEqual({ type: 'beat', index: 0 });

    // 无提前判定时同样在越过拍点的那一步发出
    const onTime = play(advanceTo(startPlaying(), beatAtMs(0) - 100), IDLE, 100, 1);
    expect(onTime.events).toContainEqual({ type: 'beat', index: 0 });
  });

  it('连击只数 perfect：perfect/good/perfect/perfect → maxCombo 2', () => {
    let st = startPlaying();
    let events: RhythmGameEvent[] = [];
    const confirmAt = (ms: number): void => {
      st = advanceTo(st, ms);
      const r = step(st, { confirm: true }, 0);
      st = r.state;
      events.push(...r.events);
    };
    confirmAt(beatAtMs(0)); // perfect
    confirmAt(beatAtMs(1) + 200); // good
    confirmAt(beatAtMs(2) + 100); // perfect
    confirmAt(beatAtMs(3) + 100); // perfect
    expect(resultsOf(events)).toEqual(['perfect', 'good', 'perfect', 'perfect']);
    expect(st.maxCombo).toBe(2);
    expect(st.score).toBe(100 + 60 + 100 + 100);
  });

  it('16 拍全 perfect：S 评级、1600 分、连击 16、游戏结束', () => {
    let st = startPlaying();
    const all: RhythmGameEvent[] = [];
    for (let i = 0; i < BEATS; i += 1) {
      st = advanceTo(st, beatAtMs(i));
      const r = step(st, { confirm: true }, 0);
      st = r.state;
      all.push(...r.events);
    }
    expect(st.phase).toBe('over');
    expect(st.results).toHaveLength(16);
    expect(st.results.every((x) => x === 'perfect')).toBe(true);
    expect(st.score).toBe(1600);
    expect(st.maxCombo).toBe(16);
    const over = all.find((e) => e.type === 'gameOver');
    expect(over).toMatchObject({ type: 'gameOver', stats: { rating: 'S', accuracy: 1, score: 1600 } });
  });

  it('ratingFor 分档：95/85/70 三档', () => {
    const arr = (hit: number, total = 16): JudgeResult[] => [
      ...Array<JudgeResult>(hit).fill('perfect'),
      ...Array<JudgeResult>(total - hit).fill('miss'),
    ];
    expect(ratingFor(arr(16))).toBe('S');
    expect(ratingFor(arr(15))).toBe('A');
    expect(ratingFor(arr(14))).toBe('A');
    expect(ratingFor(arr(12))).toBe('B');
    expect(ratingFor(arr(11))).toBe('C');
  });

  it('durationMs 覆盖：到点提前结束，没判的拍子记 miss，results 恒为 16 条', () => {
    const st = advanceTo(startPlaying({ durationMs: 2500 }), 2500);
    expect(st.phase).toBe('over');
    expect(st.results).toHaveLength(16);
    expect(st.results.filter((r) => r === 'miss')).toHaveLength(16);
  });

  it('confirm 按住不放只有一次上升沿，不会连续判定', () => {
    const st = startPlaying();
    const r = play(st, { confirm: true }, 100, 15);
    // 第一帧 offset=-1000 被忽略，之后无上升沿，拍点后自动 miss，只有一条判定
    expect(r.st.results).toHaveLength(1);
    expect(r.st.results[0]).toBe('miss');
    expect(r.st.score).toBe(0);
  });

  it('时长上限：默认 16 拍自然结束，cap 不会提前触发', () => {
    const st = createInitialState();
    expect(st.durationMs).toBeGreaterThan(beatAtMs(15) + GOOD_MS);
  });
});
