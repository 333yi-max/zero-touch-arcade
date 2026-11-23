import { describe, expect, it } from 'vitest';
import { demoAimCursor, nearestStar, slipFor } from '../src/game/demoAim';
import { createInitialState, step, type StarGameState } from '../src/game/starGame';
import { GestureEngine } from '../src/input/gestureEngine';
import { ScriptedSource } from '../src/input/scriptedSource';

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const IDLE = { cursorX: 0, confirm: false, pause: false };

function withStars(ids: { id: number; x: number }[]): StarGameState {
  return {
    ...createInitialState({ rand: seededRand(1) }),
    stars: ids.map((s) => ({ ...s, y: 100, vy: 200, gold: false })),
  };
}

describe('game/demoAim', () => {
  it('sin-hash 确定且落在 0..1', () => {
    expect(slipFor(42)).toBe(slipFor(42));
    expect(slipFor(42)).toBeGreaterThanOrEqual(0);
    expect(slipFor(42)).toBeLessThan(1);
  });

  it('最近一颗星 = y 最大的那颗', () => {
    const state: StarGameState = {
      ...createInitialState({ rand: seededRand(1) }),
      stars: [
        { id: 1, x: 100, y: 300, vy: 150, gold: false },
        { id: 2, x: 600, y: 80, vy: 200, gold: true },
        { id: 3, x: 300, y: 500, vy: 120, gold: false },
      ],
    };
    expect(nearestStar(state.stars)?.id).toBe(3);
  });

  it('没有星星时瞄准点慢慢回中', () => {
    const state = createInitialState({ rand: seededRand(2) });
    const out = demoAimCursor({ prev: -0.5, state, timeMs: 0 });
    expect(out.cursorX).toBeGreaterThan(-0.5);
    expect(out.cursorX).toBeLessThan(0);
  });

  it('每帧移动量不超过 0.08（lerp + 摆动）', () => {
    const state = withStars([{ id: 9, x: 732 }]);
    let prev = 0;
    let last = 0;
    for (let i = 0; i < 120; i += 1) {
      const out = demoAimCursor({ prev, state, timeMs: i * 16 });
      expect(Math.abs(out.cursorX - last)).toBeLessThanOrEqual(0.08);
      prev = out.next;
      last = out.cursorX;
    }
  });

  it('多帧积分后逼近目标星', () => {
    const state = withStars([{ id: 9, x: 732 }]);
    let prev = 0;
    for (let i = 0; i < 120; i += 1) {
      prev = demoAimCursor({ prev, state, timeMs: i * 16 }).next;
    }
    const target = (732 - 400) / 332;
    expect(Math.abs(prev - target)).toBeLessThan(0.05);
  });

  it('故意漏掉的星：多帧后偏到接不住的一侧', () => {
    const slippedId = Array.from({ length: 60 }, (_, i) => i + 1).find(
      (id) => slipFor(id) > 0.88,
    );
    expect(slippedId).toBeDefined();
    const state = withStars([{ id: slippedId!, x: 300 }]);
    let prev = (300 - 400) / 332; // 起点就压在目标上，看它自己挪开
    for (let i = 0; i < 120; i += 1) {
      prev = demoAimCursor({ prev, state, timeMs: i * 16 }).next;
    }
    const honest = (300 - 400) / 332;
    // 推向中央：偏移 0.36 cursor ≈ 120px，超过 75px 接住窗口
    expect(Math.abs(prev - honest)).toBeGreaterThan(0.25);
  });

  it('整局模拟：虚拟玩家漏 3 颗结束，分数落在 300–600', () => {
    const engine = new GestureEngine({ mirrorX: 1 });
    let s = step(createInitialState({ rand: seededRand(7) }), { ...IDLE, confirm: true }, 16).state;
    const latch = { confirm: false, pause: false };
    let aim = 0;
    let stats = { score: 0, caught: 0, missed: 0, maxCombo: 0 };

    for (let t = 0; t < 95_000 && s.phase !== 'over'; t += 16) {
      const res = engine.update(ScriptedSource.frameAt(t));
      latch.confirm = latch.confirm || res.state.confirm || res.events.includes('confirm');
      latch.pause = latch.pause || res.state.pause || res.events.includes('pause');
      const out = demoAimCursor({ prev: aim, state: s, timeMs: t });
      aim = out.next;
      const r = step(s, { cursorX: out.cursorX, confirm: latch.confirm, pause: latch.pause }, 16);
      latch.confirm = false;
      latch.pause = false;
      s = r.state;
      for (const e of r.events) {
        if (e.type === 'gameOver') stats = e.stats;
      }
    }

    expect(s.phase).toBe('over');
    expect(s.overCause).toBe('lives');
    expect(stats.missed).toBe(3);
    expect(stats.caught).toBeGreaterThan(10);
    expect(stats.score).toBeGreaterThanOrEqual(300);
    expect(stats.score).toBeLessThanOrEqual(600);
    console.log('demo 整局模拟:', JSON.stringify(stats));
  });
});
