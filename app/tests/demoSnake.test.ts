import { describe, expect, it } from 'vitest';
import { demoSnakeTurn, nearestOrb, torusSignedDelta } from '../src/game/demoSnake';
import { createInitialState, step, type SnakeGameState } from '../src/game/snakeGame';
import { GestureEngine } from '../src/input/gestureEngine';
import { ScriptedSource } from '../src/input/scriptedSource';

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function withOrbs(ids: { id: number; x: number; y: number }[]): SnakeGameState {
  return {
    ...createInitialState({ rand: seededRand(1) }),
    phase: 'playing',
    orbs: ids.map((o) => ({ ...o, gold: false })),
  };
}

describe('game/demoSnake', () => {
  it('环面有向差：短边带符号', () => {
    expect(torusSignedDelta(790, 10, 800)).toBe(20);
    expect(torusSignedDelta(10, 790, 800)).toBe(-20);
    expect(torusSignedDelta(100, 400, 800)).toBe(300);
  });

  it('nearestOrb 按环面距离挑最近的光球', () => {
    const s = withOrbs([
      { id: 1, x: 700, y: 300 },
      { id: 2, x: 20, y: 300 }, // 环面距离 420 → 但穿过左边界后离头只有 20+400=420？头在 (400,300)
      { id: 3, x: 500, y: 320 },
    ]);
    expect(nearestOrb(s.orbs, s.segments[0])?.id).toBe(3);
  });

  it('光球在左：朝右的蛇向左转（cursorX > 0）', () => {
    const s = withOrbs([{ id: 9, x: 200, y: 300 }]);
    const out = demoSnakeTurn(0, s, 0);
    expect(out).toBeCloseTo(1, 5);
  });

  it('穿墙最近的一侧：球在右边界外一点点，不绕远路', () => {
    const s = withOrbs([{ id: 9, x: 790, y: 300 }]);
    // 头 (400,300) 朝右：球在右边，转向应该接近 0
    const out = demoSnakeTurn(0, s, 0);
    expect(Math.abs(out)).toBeLessThan(0.3);
  });

  it('没有光球时朝场地中心转', () => {
    const s = withOrbs([]);
    // 头 (400,300) 就在中心：转向接近 0（只有摆动）
    expect(Math.abs(demoSnakeTurn(0, s, 0))).toBeLessThan(0.05);
    // 把头挪到右下角：中心在左上方，朝右的蛇要右转（cursorX < 0）
    s.segments = [{ x: 700, y: 500 }, ...s.segments.slice(1)];
    expect(demoSnakeTurn(0, s, 0)).toBeLessThan(-0.9);
  });

  it('整局模拟：虚拟玩家 90 秒吃球到时间结束，分数落在合理区间', () => {
    const engine = new GestureEngine({ mirrorX: 1 });
    let s = step(createInitialState({ rand: seededRand(7) }), { cursorX: 0, confirm: true, pause: false }, 16).state;
    const latch = { confirm: false, pause: false };
    let stats = { eaten: 0, golds: 0, score: 0 };

    for (let t = 0; t < 95_000 && s.phase !== 'over'; t += 16) {
      const res = engine.update(ScriptedSource.frameAt(t));
      latch.confirm = latch.confirm || res.state.confirm || res.events.includes('confirm');
      latch.pause = latch.pause || res.state.pause || res.events.includes('pause');
      const cursorX = demoSnakeTurn(0, s, t);
      const r = step(s, { cursorX, confirm: latch.confirm, pause: latch.pause }, 16);
      latch.confirm = false;
      latch.pause = false;
      s = r.state;
      for (const e of r.events) {
        if (e.type === 'gameOver') stats = e.stats;
      }
    }

    expect(s.phase).toBe('over');
    expect(stats.eaten).toBeGreaterThan(20);
    expect(stats.golds).toBeGreaterThanOrEqual(3);
    expect(stats.score).toBeGreaterThan(300);
    console.log('demo 整局模拟:', JSON.stringify(stats));
  });
});
