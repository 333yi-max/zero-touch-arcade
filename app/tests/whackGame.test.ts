import { describe, expect, it } from 'vitest';
import {
  COUNTDOWN_MS,
  GAME_DURATION_MS,
  HOLE_COUNT,
  MAX_MISSES,
  MAX_STEP_MS,
  MOLE_LIFE_MAX_MS,
  MOLE_LIFE_MIN_MS,
  TARGET_HITS,
  createInitialState,
  cursorForHole,
  holeIndexForCursor,
  multiplierFor,
  step,
  whackPathPoint,
  type WhackGameInput,
  type WhackGameState,
} from '../src/game/whackGame';

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const IDLE: WhackGameInput = { cursorX: 0, confirm: false, pause: false };

/** ready → confirm → countdown 走完 → playing。 */
function toPlaying(state: WhackGameState): WhackGameState {
  let s = state;
  s = step(s, { ...IDLE, confirm: true }, 16).state;
  for (let i = 0; i < Math.ceil(COUNTDOWN_MS / 16); i += 1) {
    s = step(s, IDLE, 16).state;
  }
  return s;
}

function advance(state: WhackGameState, ms: number, input: WhackGameInput = IDLE): WhackGameState {
  let s = state;
  for (let t = 0; t < ms; t += 16) s = step(s, input, 16).state;
  return s;
}

describe('game/whackGame · 蛇形路径映射', () => {
  it('路径端点与中点落在洞心上', () => {
    expect(whackPathPoint(0)).toEqual({ x: 250, y: 190 });
    expect(whackPathPoint(0.5)).toEqual({ x: 400, y: 300 });
    expect(whackPathPoint(1)).toEqual({ x: 550, y: 410 });
    // 洞 0 与洞 1 的中点（路径第 1 段半程）
    expect(whackPathPoint(0.0625)).toEqual({ x: 325, y: 190 });
  });

  it('一维准星 ↔ 洞序号往返一致，中点向高位取整', () => {
    expect(holeIndexForCursor(-1)).toBe(0);
    expect(holeIndexForCursor(0)).toBe(4);
    expect(holeIndexForCursor(1)).toBe(8);
    for (let i = 0; i < HOLE_COUNT; i += 1) {
      expect(holeIndexForCursor(cursorForHole(i))).toBe(i);
    }
    // 洞 0 与洞 1 的分界在 -0.875，越过它取整进洞 1
    expect(holeIndexForCursor(cursorForHole(0) + 0.125)).toBe(1);
    expect(holeIndexForCursor(cursorForHole(1) - 0.125 - 1e-6)).toBe(0);
  });

  it('倍率：每 5 连击 +1，封顶 ×3', () => {
    expect(multiplierFor(0)).toBe(1);
    expect(multiplierFor(4)).toBe(1);
    expect(multiplierFor(5)).toBe(2);
    expect(multiplierFor(9)).toBe(2);
    expect(multiplierFor(10)).toBe(3);
    expect(multiplierFor(99)).toBe(3);
  });
});

describe('game/whackGame · 流程与规则', () => {
  it('初始：9 洞全空、ready、0 分', () => {
    const s = createInitialState({ rand: seededRand(1) });
    expect(s.phase).toBe('ready');
    expect(s.moles).toHaveLength(HOLE_COUNT);
    expect(s.moles.every((m) => !m.visible)).toBe(true);
    expect(s.score).toBe(0);
  });

  it('点头开始 → 倒计时 → playing', () => {
    let s = createInitialState({ rand: seededRand(1) });
    s = step(s, { ...IDLE, confirm: true }, 16).state;
    expect(s.phase).toBe('countdown');
    s = toPlaying(s);
    expect(s.phase).toBe('playing');
  });

  it('地鼠按时出现：寿命 0.8–1.4 秒、第一只不是金鼠', () => {
    const s0 = toPlaying(createInitialState({ rand: seededRand(1) }));
    let s = s0;
    let spawn: { hole: number; gold: boolean } | null = null;
    for (let t = 0; t < 2000 && spawn === null; t += 16) {
      const r = step(s, IDLE, 16);
      s = r.state;
      for (const e of r.events) if (e.type === 'spawn') spawn = { hole: e.hole, gold: e.gold };
    }
    expect(spawn).not.toBeNull();
    const mole = s.moles[spawn!.hole];
    expect(mole.visible).toBe(true);
    expect(mole.lifeMs).toBeGreaterThanOrEqual(MOLE_LIFE_MIN_MS);
    expect(mole.lifeMs).toBeLessThanOrEqual(MOLE_LIFE_MAX_MS);
    expect(spawn!.gold).toBe(false);
  });

  it('第 10 只地鼠是金鼠', () => {
    let s = toPlaying(createInitialState({ rand: seededRand(1) }));
    const spawns: { hole: number; gold: boolean }[] = [];
    // 见 spawn 就敲掉，地鼠不缩回、漏数不涨，能连续攒到第 11 只
    let aim = 0;
    let hold = false;
    for (let t = 0; t < 20_000 && spawns.length < 11; t += 16) {
      const r = step(s, { cursorX: aim, confirm: hold, pause: false }, 16);
      s = r.state;
      for (const e of r.events) {
        if (e.type === 'spawn') {
          spawns.push({ hole: e.hole, gold: e.gold });
          aim = cursorForHole(e.hole);
          hold = true;
        } else if (e.type === 'hit') {
          hold = false;
        }
      }
    }
    expect(spawns.length).toBeGreaterThanOrEqual(11);
    expect(spawns[8].gold).toBe(false);
    expect(spawns[9].gold).toBe(true);
    expect(spawns[10].gold).toBe(false);
  });

  it('敲中：对准的洞有地鼠 → +10、连击 +1、洞清空', () => {
    let s = toPlaying(createInitialState({ rand: seededRand(1) }));
    let hole = -1;
    for (let t = 0; t < 2000 && hole < 0; t += 16) {
      const r = step(s, IDLE, 16);
      s = r.state;
      for (const e of r.events) if (e.type === 'spawn') hole = e.hole;
    }
    const r = step(s, { cursorX: cursorForHole(hole), confirm: true, pause: false }, 16);
    s = r.state;
    const hit = r.events.find((e) => e.type === 'hit');
    expect(hit).toBeDefined();
    expect(s.score).toBe(10);
    expect(s.hits).toBe(1);
    expect(s.combo).toBe(1);
    expect(s.moles[hole].visible).toBe(false);
  });

  it('敲空：combo 清零、不扣漏数', () => {
    let s = toPlaying(createInitialState({ rand: seededRand(1) }));
    s = advance(s, 700); // seed 1 的第一只地鼠落在洞 2，准星放洞 8 必空
    const r = step(s, { cursorX: 1, confirm: true, pause: false }, 16);
    expect(r.events.some((e) => e.type === 'whiff')).toBe(true);
    expect(r.state.combo).toBe(0);
    expect(r.state.misses).toBe(0);
  });

  it('金鼠敲中 +30×倍率', () => {
    let s = toPlaying(createInitialState({ rand: seededRand(1) }));
    // 手工放一只金鼠在洞 3
    s = {
      ...s,
      moles: s.moles.map((m, i) =>
        i === 3 ? { visible: true, gold: true, lifeMs: 1200, leftMs: 1200 } : { ...m, visible: false },
      ),
      combo: 4,
    };
    const r = step(s, { cursorX: cursorForHole(3), confirm: true, pause: false }, 16);
    expect(r.state.score).toBe(30 * 2); // combo 4+1=5 → ×2
    expect(r.state.combo).toBe(5);
  });

  it('缩回算漏，漏满 8 个结束（misses）', () => {
    const s0 = toPlaying(createInitialState({ rand: seededRand(1) }));
    let s = advance(s0, 30_000);
    // 全程不敲，地鼠全缩回；30 秒内 spawn ≈ 35 只，漏满 8 早就结束
    expect(s.phase).toBe('over');
    expect(s.overCause).toBe('misses');
    expect(s.misses).toBe(MAX_MISSES);
  });

  it('敲满 25 个结束（hits）', () => {
    let s = toPlaying(createInitialState({ rand: seededRand(1) }));
    for (let t = 0; t < 60_000 && s.phase !== 'over'; t += 16) {
      // 简单 bot：见 spawn 就立刻对准敲
      const r0 = step(s, IDLE, 16);
      s = r0.state;
      const spawn = r0.events.find((e) => e.type === 'spawn');
      if (spawn && spawn.type === 'spawn') {
        s = step(s, { cursorX: cursorForHole(spawn.hole), confirm: true, pause: false }, 16).state;
      }
    }
    expect(s.phase).toBe('over');
    expect(s.overCause).toBe('hits');
    expect(s.hits).toBe(TARGET_HITS);
    expect(s.misses).toBe(0);
  });

  it('时间到结束（time）', () => {
    let s = toPlaying(createInitialState({ rand: seededRand(1), durationMs: 1_000 }));
    s = advance(s, 1_200);
    expect(s.phase).toBe('over');
    expect(s.overCause).toBe('time');
    expect(s.hits).toBeLessThan(TARGET_HITS);
    expect(s.misses).toBeLessThan(MAX_MISSES);
  });

  it('暂停/恢复：暂停期间时间不走，恢复的 confirm 不敲地鼠', () => {
    let s = toPlaying(createInitialState({ rand: seededRand(1) }));
    s = step(s, { ...IDLE, pause: true }, 16).state;
    expect(s.phase).toBe('paused');
    const elapsedBefore = s.elapsedMs;
    s = advance(s, 500, { ...IDLE, pause: true }); // 保持 pause=true 只有边沿生效
    expect(s.elapsedMs).toBe(elapsedBefore);
    s = step(s, { ...IDLE, confirm: true }, 16).state;
    expect(s.phase).toBe('playing');
  });

  it('倒计时里也能暂停，恢复后接着数', () => {
    let s = createInitialState({ rand: seededRand(1) });
    s = step(s, { ...IDLE, confirm: true }, 16).state;
    s = step(s, { ...IDLE, pause: true }, 16).state;
    expect(s.phase).toBe('paused');
    s = step(s, { ...IDLE, confirm: true }, 16).state;
    expect(s.phase).toBe('countdown');
  });

  it('dt 钳位：5000ms 只推进 100ms', () => {
    const s0 = toPlaying(createInitialState({ rand: seededRand(1) }));
    const s1 = step(s0, IDLE, 5000).state;
    expect(s1.elapsedMs - s0.elapsedMs).toBe(MAX_STEP_MS);
  });

  it('按住 confirm 只敲一下（边沿触发）', () => {
    let s = toPlaying(createInitialState({ rand: seededRand(1) }));
    const held: WhackGameInput = { cursorX: 1, confirm: true, pause: false };
    const r1 = step(s, held, 16);
    s = r1.state;
    const r2 = step(s, held, 16);
    const whiffs = [r1, r2].flatMap((r) => r.events).filter((e) => e.type === 'whiff');
    expect(whiffs).toHaveLength(1);
  });

  it('帧间旧状态不被改写（浅拷贝隔离）', () => {
    const s0 = toPlaying(createInitialState({ rand: seededRand(1) }));
    const s = advance(s0, 700); // 此时洞 2 有地鼠
    const hole = s.moles.findIndex((m) => m.visible);
    expect(hole).toBeGreaterThanOrEqual(0);
    const snapshot = s.moles.map((m) => ({ ...m }));
    const r = step(s, { cursorX: cursorForHole(hole), confirm: true, pause: false }, 16);
    expect(s.moles).toEqual(snapshot); // 敲之前的旧状态原样
    expect(s.moles[hole].visible).toBe(true);
    expect(r.state.moles[hole].visible).toBe(false); // 只有新状态被清
    expect(s.score).toBe(0);
  });

  it('准星跟手：任何相位都从 input 抄进状态，旧状态不动', () => {
    const s0 = createInitialState({ rand: seededRand(1) });
    const s1 = step(s0, { ...IDLE, cursorX: -0.5 }, 16).state;
    expect(s1.cursorX).toBe(-0.5);
    expect(s0.cursorX).toBe(0);
  });

  it('默认 60 秒时长', () => {
    expect(createInitialState({ rand: seededRand(1) }).durationMs).toBe(GAME_DURATION_MS);
  });
});
