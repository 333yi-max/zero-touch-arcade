import { describe, expect, it } from 'vitest';
import {
  DEMO_CANDLE_START,
  demoCandleInput,
  type DemoCandleMemory,
} from '../src/game/demoCandle';
import { CANDLE_COUNT, createInitialState, step, type CandleGameState } from '../src/game/candleGame';

describe('game/demoCandle', () => {
  it('ready 相位延迟后自己点头开局', () => {
    const state = createInitialState();
    let mem: DemoCandleMemory = { ...DEMO_CANDLE_START };
    const first = demoCandleInput(mem, state, 0);
    // pulsedAt 是 -1e9，任何真实时间戳都超过 1.5 秒停顿
    expect(first.confirm).toBe(true);
    mem = first.next;
    const second = demoCandleInput(mem, state, 100);
    expect(second.confirm).toBe(false); // 刚点过头，不再连发
  });

  it('playing 里按节拍呼吸：一半时间吹、一半时间停', () => {
    const state = { ...createInitialState(), phase: 'playing' } as CandleGameState;
    let mem: DemoCandleMemory = { pulsedAt: 0 };
    const samples: boolean[] = [];
    for (let t = 0; t < 3000; t += 100) {
      samples.push(demoCandleInput(mem, state, t).blow);
    }
    expect(samples.slice(0, 5).every((b) => b)).toBe(true); // 前 500ms 全吹
    expect(samples.slice(5, 10).every((b) => !b)).toBe(true); // 后 500ms 全停
    expect(samples.some((b) => b)).toBe(true);
    expect(samples.some((b) => !b)).toBe(true);
  });

  it('整局模拟：十几秒内吹完全部蜡烛，满分 140', () => {
    let s = createInitialState();
    let mem: DemoCandleMemory = { ...DEMO_CANDLE_START };
    let stats = { score: 0, extinguished: 0, chained: 0 };
    const t0 = 16_000; // 用一个大起始时间戳模拟真实时钟，ready 停顿立即生效

    for (let t = t0; t < t0 + 30_000 && s.phase !== 'over'; t += 16) {
      const out = demoCandleInput(mem, s, t);
      mem = out.next;
      const r = step(s, { confirm: out.confirm, blow: out.blow }, 16);
      s = r.state;
      for (const e of r.events) {
        if (e.type === 'gameOver') stats = e.stats;
      }
    }

    expect(s.phase).toBe('over');
    expect(s.overCause).toBe('done');
    expect(stats.extinguished).toBe(CANDLE_COUNT);
    expect(stats.chained).toBe(CANDLE_COUNT - 1);
    expect(stats.score).toBe(140);
    // 每支约 1.6 秒 × 5 = 8 秒左右，留宽松界
    expect(s.elapsedMs).toBeGreaterThan(4_000);
    expect(s.elapsedMs).toBeLessThan(20_000);
    console.log('candle demo 整局模拟:', JSON.stringify(stats), `耗时 ${s.elapsedMs}ms`);
  });
});
