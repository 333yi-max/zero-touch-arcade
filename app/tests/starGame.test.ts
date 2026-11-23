import { describe, expect, it } from 'vitest';
import {
  BASE_POINTS,
  GAME_DURATION_MS,
  GOLD_POINTS,
  MAX_MULTIPLIER,
  PADDLE_Y,
  STAR_RADIUS,
  createInitialState,
  multiplierFor,
  paddleXFromCursor,
  step,
  statsOf,
  type StarGameState,
} from '../src/game/starGame';

/** 线性同余发生器：测试里所有“随机”都是可重放的。 */
function seededRand(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

function playingState(): StarGameState {
  return { ...createInitialState({ rand: seededRand(7) }), phase: 'playing' };
}

/** 直接往画布里塞一颗星，跳过 600ms 的生成节拍。 */
function withStar(s: StarGameState, x: number, y: number, gold = false): StarGameState {
  return { ...s, stars: [...s.stars, { id: 99, x, y, vy: 200, gold }] };
}

function run(s: StarGameState, input: { cursorX: number; confirm: boolean; pause: boolean }, dtMs: number, times: number) {
  let cur = s;
  const events: ReturnType<typeof step>['events'] = [];
  for (let i = 0; i < times; i += 1) {
    const r = step(cur, input, dtMs);
    cur = r.state;
    events.push(...r.events);
  }
  return { state: cur, events };
}

const IDLE = { cursorX: 0, confirm: false, pause: false };

describe('game/starGame', () => {
  it('挡板映射：-1/0/1 到两端与中点，越界钳住', () => {
    expect(paddleXFromCursor(-1)).toBe(68);
    expect(paddleXFromCursor(0)).toBe(400);
    expect(paddleXFromCursor(1)).toBe(732);
    expect(paddleXFromCursor(1.5)).toBe(732);
    expect(paddleXFromCursor(-2)).toBe(68);
  });

  it('接住普通星星 +10，combo 与分数同步涨', () => {
    const r = step(withStar(playingState(), 400, PADDLE_Y - 1), IDLE, 16);
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: 'catch', gold: false, base: BASE_POINTS, multiplier: 1, combo: 1 }),
    );
    expect(r.state.score).toBe(10);
    expect(r.state.caught).toBe(1);
    expect(r.state.combo).toBe(1);
  });

  it('连击倍率：第 5 个 ×2，第 10 个 ×3，封顶 ×3', () => {
    const multipliers: number[] = [];
    let s = playingState();
    for (let i = 0; i < 12; i += 1) {
      s = withStar(s, 400, PADDLE_Y - 1);
      const r = step(s, IDLE, 16);
      s = r.state;
      const catchEvent = r.events.find((e) => e.type === 'catch');
      if (catchEvent && catchEvent.type === 'catch') multipliers.push(catchEvent.multiplier);
    }
    expect(multipliers).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3]);
    expect(multiplierFor(99)).toBe(MAX_MULTIPLIER);
    // 12 个 ×10 分，倍率 1×4 + 2×5 + 3×3 = 23 → 230 分
    expect(s.score).toBe(230);
  });

  it('漏掉清零连击与倍率，且扣一条命', () => {
    let s = playingState();
    for (let i = 0; i < 6; i += 1) {
      s = withStar(s, 400, PADDLE_Y - 1);
      s = step(s, IDLE, 16).state;
    }
    expect(multiplierFor(s.combo)).toBe(2);
    // 挡板在中间，这颗星在最右端，必然漏
    s = withStar(s, 700, 590);
    const r = run(s, IDLE, 100, 3);
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: 'miss', comboBefore: 6, livesLeft: 4 }),
    );
    expect(r.state.combo).toBe(0);
    expect(multiplierFor(r.state.combo)).toBe(1);
  });

  it('漏 5 个立即结束，结束事件带统计', () => {
    let s = playingState();
    const gameOver: { cause: string; stats: ReturnType<typeof statsOf> }[] = [];
    for (let i = 0; i < 5; i += 1) {
      s = withStar(s, 700, 590);
      const r = run(s, IDLE, 100, 3);
      s = r.state;
      for (const e of r.events) if (e.type === 'gameOver') gameOver.push({ cause: e.cause, stats: e.stats });
    }
    expect(s.phase).toBe('over');
    expect(s.overCause).toBe('lives');
    expect(s.lives).toBe(0);
    expect(gameOver).toHaveLength(1);
    expect(gameOver[0]).toMatchObject({ cause: 'lives', stats: { missed: 5, caught: 0, total: 5 } });
  });

  it('90 秒上限：到点以 time 结束（默认时长常量锁 90000ms）', () => {
    expect(GAME_DURATION_MS).toBe(90_000);
    const s = { ...createInitialState({ rand: seededRand(3), durationMs: 2000 }), phase: 'playing' };
    const r = run(s, IDLE, 100, 25);
    expect(r.state.phase).toBe('over');
    expect(r.state.overCause).toBe('time');
    expect(r.events.some((e) => e.type === 'gameOver' && e.cause === 'time')).toBe(true);
  });

  it('每第 8 颗是金星星，接住 +30', () => {
    let s: StarGameState = { ...createInitialState({ rand: seededRand(11) }), phase: 'playing', spawnedCount: 7 };
    s = run(s, IDLE, 100, 9).state; // 750ms → 生成第 8 颗
    expect(s.stars).toHaveLength(1);
    expect(s.stars[0].gold).toBe(true);

    const gold = s.stars[0];
    const cursorX = (gold.x - 400) / 332;
    let caught = false;
    let r = { state: s, events: [] as ReturnType<typeof step>['events'] };
    for (let i = 0; i < 60 && !caught; i += 1) {
      r = step(r.state, { cursorX, confirm: false, pause: false }, 100);
      caught = r.events.some((e) => e.type === 'catch');
    }
    expect(caught).toBe(true);
    const catchEvent = r.events.find((e) => e.type === 'catch');
    expect(catchEvent && catchEvent.type === 'catch' && catchEvent.gold).toBe(true);
    expect(catchEvent && catchEvent.type === 'catch' && catchEvent.base).toBe(GOLD_POINTS);
    expect(r.state.score).toBe(30);
  });

  it('倒计时：confirm 启动 3 秒倒计时，期间 confirm 被忽略，到点自动开玩', () => {
    let s = createInitialState({ rand: seededRand(5) });
    const start = step(s, { cursorX: 0, confirm: true, pause: false }, 16);
    expect(start.state.phase).toBe('countdown');
    expect(start.events.map((e) => e.type)).toEqual(['phase', 'countdown']);
    expect(start.events[1]).toEqual({ type: 'countdown', remaining: 3 });

    // 倒计时进行中再来一次 confirm：不该有任何新事件
    const during = step(start.state, { cursorX: 0, confirm: true, pause: false }, 100);
    expect(during.state.phase).toBe('countdown');
    expect(during.events.filter((e) => e.type !== 'countdown')).toEqual([]);

    // 注意 dt 被钳到 100ms：3000ms 的倒计时要 31 步
    const finished = run(start.state, IDLE, 100, 31);
    expect(finished.state.phase).toBe('playing');
    expect(finished.events.map((e) => (e.type === 'countdown' ? e.remaining : e.type))).toEqual([
      2,
      1,
      0,
      'phase',
    ]);
  });

  it('游戏中 confirm 不产生任何效果', () => {
    const s = playingState();
    const r = step(s, { cursorX: 0, confirm: true, pause: false }, 16);
    expect(r.state.phase).toBe('playing');
    expect(r.events).toEqual([]);
  });

  it('暂停：张嘴停、张嘴或点头恢复；暂停期间计时不推进', () => {
    let s = playingState();
    s = step(s, { cursorX: 0, confirm: false, pause: true }, 16).state;
    expect(s.phase).toBe('paused');
    const frozen = run(s, IDLE, 100, 5);
    expect(frozen.state.elapsedMs).toBe(s.elapsedMs);
    expect(frozen.state.phase).toBe('paused');

    // 点头恢复（恢复用的 confirm 不作用于游戏内）
    const resumed = step(frozen.state, { cursorX: 0, confirm: true, pause: false }, 16);
    expect(resumed.state.phase).toBe('playing');
  });

  it('倒计时中也能暂停，张嘴恢复后继续倒计时', () => {
    const started = step(createInitialState({ rand: seededRand(5) }), { cursorX: 0, confirm: true, pause: false }, 16);
    const paused = step(started.state, { cursorX: 0, confirm: false, pause: true }, 16);
    expect(paused.state.phase).toBe('paused');
    // 脉冲只持续一帧：先喂一帧 pause=false 让边沿重新武装，再张嘴
    const rearmed = step(paused.state, IDLE, 16);
    const resumed = step(rearmed.state, { cursorX: 0, confirm: false, pause: true }, 16);
    expect(resumed.state.phase).toBe('countdown');
  });

  it('挡板在倒计时和暂停里也实时跟手', () => {
    const s = createInitialState({ rand: seededRand(5) });
    const r = step(s, { cursorX: -0.5, confirm: false, pause: false }, 16);
    expect(r.state.paddleX).toBe(234);
  });

  it('生成节奏：750ms 一颗，速度落在 110–220', () => {
    const s = playingState();
    const r = run(s, IDLE, 100, 16);
    expect(r.state.stars).toHaveLength(2);
    for (const star of r.state.stars) {
      expect(star.vy).toBeGreaterThanOrEqual(110);
      expect(star.vy).toBeLessThanOrEqual(220);
      expect(star.x).toBeGreaterThanOrEqual(40);
      expect(star.x).toBeLessThanOrEqual(760);
    }
  });

  it('星星落到底且没接住才算漏，中途不误判', () => {
    const high = withStar(playingState(), 700, STAR_RADIUS + 1);
    const r = run(high, IDLE, 100, 3); // 只掉了 60px，远没到底
    expect(r.state.missed).toBe(0);
    expect(r.state.lives).toBe(5);
    // 贴近底部的星星两步内掉穿；期间新生成的星星才掉 20px，不会干扰
    const low = withStar(playingState(), 700, 596);
    const r2 = run(low, IDLE, 100, 2);
    expect(r2.state.missed).toBe(1);
  });
});
