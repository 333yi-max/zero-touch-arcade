import { describe, expect, it } from 'vitest';
import { demoRhythmInput } from '../src/game/demoRhythm';
import {
  BEATS,
  beatAtMs,
  createInitialState,
  step,
  statsOf,
  type RhythmGameState,
} from '../src/game/rhythmGame';

function playing(elapsedMs: number, beatIndex: number): RhythmGameState {
  return { ...createInitialState(), phase: 'playing', elapsedMs, beatIndex };
}

/** 用演示输入整局推完（16ms 步进 ≈ 浏览器 60fps，纯 node，无 RAF）。 */
function playFullDemo(): RhythmGameState {
  let s = createInitialState();
  let guard = 0;
  while (s.phase !== 'over' && guard < 5000) {
    guard += 1;
    const input = demoRhythmInput({ confirm: false }, s);
    s = step(s, input, 16).state;
  }
  return s;
}

describe('game/demoRhythm', () => {
  it('ready 里点头开局，其余相位不点头', () => {
    expect(demoRhythmInput({ confirm: false }, createInitialState()).confirm).toBe(true);
    const countdown = { ...createInitialState(), phase: 'countdown' as const };
    expect(demoRhythmInput({ confirm: false }, countdown).confirm).toBe(false);
    // 偶数拍提前 40ms：目标时刻前不点头，到点即点头
    expect(demoRhythmInput({ confirm: false }, playing(beatAtMs(2) - 41, 2)).confirm).toBe(false);
    expect(demoRhythmInput({ confirm: false }, playing(beatAtMs(2) - 40, 2)).confirm).toBe(true);
  });

  it('跳过第 4、第 11 拍，其余每拍 ±60ms 内点头', () => {
    expect(demoRhythmInput({ confirm: false }, playing(9999, 3)).confirm).toBe(false);
    expect(demoRhythmInput({ confirm: false }, playing(9999, 10)).confirm).toBe(false);
    // 偶数拍提前 40ms：到点前不点头
    expect(demoRhythmInput({ confirm: false }, playing(beatAtMs(4) - 41, 4)).confirm).toBe(false);
    // 奇数拍延后 40ms：过点即点头
    expect(demoRhythmInput({ confirm: false }, playing(beatAtMs(5) + 40, 5)).confirm).toBe(true);
  });

  it('整局完整打完：16 条判定、14 命中、评级 A、连击 6', () => {
    const s = playFullDemo();
    expect(s.phase).toBe('over');
    expect(s.results).toHaveLength(BEATS);
    expect(s.results[3]).toBe('miss');
    expect(s.results[10]).toBe('miss');
    for (const i of s.results.keys()) {
      if (i !== 3 && i !== 10) expect(s.results[i]).toBe('perfect');
    }
    const stats = statsOf(s);
    expect(stats.score).toBe(1400);
    expect(stats.maxCombo).toBe(6);
    expect(stats.accuracy).toBeCloseTo(14 / 16);
    expect(stats.rating).toBe('A');
  });
});
