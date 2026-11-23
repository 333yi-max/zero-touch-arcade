import { describe, expect, it } from 'vitest';
import {
  DEMO_WHACK_START,
  demoWhackInput,
  type DemoWhackMemory,
} from '../src/game/demoWhack';
import {
  TARGET_HITS,
  createInitialState,
  cursorForHole,
  step,
  type WhackGameState,
} from '../src/game/whackGame';

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function withMole(hole: number, gold = false): WhackGameState {
  return {
    ...createInitialState({ rand: seededRand(1) }),
    phase: 'playing',
    moles: Array.from({ length: 9 }, (_, i) =>
      i === hole
        ? { visible: true, gold, lifeMs: 1000, leftMs: 1000 }
        : { visible: false, gold: false, lifeMs: 0, leftMs: 0 },
    ),
  };
}

describe('game/demoWhack', () => {
  it('有地鼠时朝最近的那只滑，到位才点头', () => {
    const state = withMole(6);
    let mem: DemoWhackMemory = { ...DEMO_WHACK_START, cursorX: 0.9 }; // 起点靠近洞 7
    let out = demoWhackInput(mem, state, 1000);
    // 洞 6 的准星值是 0.5，第一帧就朝它挪（而不是洞 0）
    expect(out.cursorX).toBeLessThan(0.9);
    expect(out.confirm).toBe(false);
    mem = out.next;
    let anyConfirm = false;
    for (let i = 0; i < 200; i += 1) {
      out = demoWhackInput(mem, state, 1000 + i * 16);
      mem = out.next;
      anyConfirm ||= out.confirm;
    }
    const target = cursorForHole(6);
    expect(Math.abs(out.cursorX - target)).toBeLessThan(0.06);
    expect(anyConfirm).toBe(true);
  });

  it('没有地鼠时慢慢回中，不点头', () => {
    const base = createInitialState({ rand: seededRand(1) });
    const state: WhackGameState = { ...base, phase: 'playing' };
    let mem: DemoWhackMemory = { cursorX: -0.8, pulsedAt: 0 };
    for (let i = 0; i < 12; i += 1) {
      const out = demoWhackInput(mem, state, 1000 + i * 16);
      mem = out.next;
    }
    expect(mem.cursorX).toBeGreaterThan(-0.8);
    expect(mem.cursorX).toBeLessThan(0);
    const out = demoWhackInput(mem, state, 2000);
    expect(out.confirm).toBe(false);
  });

  it('ready 相位自己点头开局', () => {
    const state = createInitialState({ rand: seededRand(1) });
    const out = demoWhackInput(DEMO_WHACK_START, state, 1000);
    expect(out.confirm).toBe(true);
  });

  it('整局模拟：60 秒内敲满 25 个结束，几乎不漏', () => {
    let s = createInitialState({ rand: seededRand(7) });
    let mem: DemoWhackMemory = { ...DEMO_WHACK_START };
    let stats = { score: 0, hits: 0, misses: 0, maxCombo: 0 };

    for (let t = 0; t < 75_000 && s.phase !== 'over'; t += 16) {
      const out = demoWhackInput(mem, s, t);
      mem = out.next;
      const r = step(s, { cursorX: out.cursorX, confirm: out.confirm, pause: false }, 16);
      s = r.state;
      for (const e of r.events) {
        if (e.type === 'gameOver') stats = e.stats;
      }
    }

    expect(s.phase).toBe('over');
    expect(s.overCause).toBe('hits');
    expect(stats.hits).toBe(TARGET_HITS);
    expect(stats.misses).toBeLessThan(3);
    expect(stats.score).toBeGreaterThan(400);
    expect(stats.score).toBeLessThan(1500);
    console.log('whack demo 整局模拟:', JSON.stringify(stats));
  });
});
