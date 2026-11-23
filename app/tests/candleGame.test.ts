import { describe, expect, it } from 'vitest';
import {
  BLOW_DECAY_RATE,
  BLOW_MS,
  CANDLE_COUNT,
  CANDLE_POINTS,
  CHAIN_BONUS,
  CHAIN_WINDOW_MS,
  COUNTDOWN_MS,
  GAME_DURATION_MS,
  MAX_STEP_MS,
  createInitialState,
  statsOf,
  step,
  type CandleGameInput,
  type CandleGameState,
} from '../src/game/candleGame';

const IDLE: CandleGameInput = { confirm: false, blow: false };

function toPlaying(): CandleGameState {
  let s = createInitialState();
  s = step(s, { confirm: true, blow: false }, 16).state;
  for (let i = 0; i < Math.ceil(COUNTDOWN_MS / 16); i += 1) s = step(s, IDLE, 16).state;
  return s;
}

function advance(s: CandleGameState, ms: number, input: CandleGameInput = IDLE): CandleGameState {
  let cur = s;
  for (let t = 0; t < ms; t += 16) cur = step(cur, input, 16).state;
  return cur;
}

describe('game/candleGame · 流程与规则', () => {
  it('初始：5 支全亮、ready、0 分', () => {
    const s = createInitialState();
    expect(s.phase).toBe('ready');
    expect(s.candles).toHaveLength(CANDLE_COUNT);
    expect(s.candles.every((lit) => lit)).toBe(true);
    expect(s.litCount).toBe(CANDLE_COUNT);
    expect(s.score).toBe(0);
  });

  it('点头开始 → 倒计时 → playing', () => {
    let s = createInitialState();
    s = step(s, { confirm: true, blow: false }, 16).state;
    expect(s.phase).toBe('countdown');
    s = advance(s, COUNTDOWN_MS + 32);
    expect(s.phase).toBe('playing');
  });

  it('持续张嘴 400ms 吹灭第一支：+20，第一支没有连吹奖励', () => {
    let s = toPlaying();
    const events = [];
    for (let t = 0; t < BLOW_MS; t += 16) {
      const r = step(s, { confirm: false, blow: true }, 16);
      s = r.state;
      events.push(...r.events);
    }
    const out = events.find((e) => e.type === 'extinguish');
    expect(out).toBeDefined();
    expect(s.candles[0]).toBe(false);
    expect(s.candles[1]).toBe(true);
    expect(s.score).toBe(CANDLE_POINTS);
    expect(s.chained).toBe(0);
  });

  it('断续吹也能灭：净吹气时间满 400ms 即灭', () => {
    let s = toPlaying();
    // 200ms 吹 / 200ms 停：每周期净 +200-100=+100，第 3 个周期的吹段里凑满 400
    let t = 0;
    while (s.candles[0] && t < 10_000) {
      const blow = (t % 400) < 200;
      s = step(s, { confirm: false, blow }, 16).state;
      t += 16;
    }
    expect(s.candles[0]).toBe(false);
    expect(s.score).toBe(CANDLE_POINTS);
    expect(t).toBeGreaterThan(800);
    expect(t).toBeLessThan(1_600);
  });

  it('停止吹气进度衰减：吹一半停手，进度按半速回落到 0', () => {
    let s = toPlaying();
    s = step(s, { confirm: false, blow: true }, 100).state;
    s = step(s, { confirm: false, blow: true }, 100).state;
    expect(s.blowMs).toBe(200);
    s = step(s, IDLE, 100).state;
    s = step(s, IDLE, 100).state;
    expect(s.blowMs).toBe(200 - 200 * BLOW_DECAY_RATE);
    s = advance(s, 1_000, IDLE);
    expect(s.blowMs).toBe(0);
    expect(s.candles[0]).toBe(true);
  });

  it('连吹：2 秒内灭下一支 +10 奖励，chained 计数', () => {
    let s = toPlaying();
    s = advance(s, BLOW_MS + 16, { confirm: false, blow: true });
    expect(s.candles[0]).toBe(false);
    expect(s.score).toBe(CANDLE_POINTS);
    s = advance(s, 500, IDLE); // 间隔 0.5s < 2s
    s = advance(s, BLOW_MS + 16, { confirm: false, blow: true });
    expect(s.candles[1]).toBe(false);
    expect(s.score).toBe(CANDLE_POINTS * 2 + CHAIN_BONUS);
    expect(s.chained).toBe(1);
  });

  it('间隔超过 2 秒没有连吹奖励', () => {
    let s = toPlaying();
    s = advance(s, BLOW_MS + 16, { confirm: false, blow: true });
    s = advance(s, CHAIN_WINDOW_MS + 100, IDLE);
    s = advance(s, BLOW_MS + 16, { confirm: false, blow: true });
    expect(s.candles[1]).toBe(false);
    expect(s.score).toBe(CANDLE_POINTS * 2);
    expect(s.chained).toBe(0);
  });

  it('吹完全部 5 支 → over done，满分 100 + 4 次连吹 40 = 140', () => {
    let s = toPlaying();
    const blow: CandleGameInput = { confirm: false, blow: true };
    // 每支吹 400ms 出头，中间休息 300ms（都 < 2s，全连）
    for (let i = 0; i < CANDLE_COUNT && s.phase !== 'over'; i += 1) {
      s = advance(s, BLOW_MS + 32, blow);
      s = advance(s, 300, IDLE);
    }
    expect(s.phase).toBe('over');
    expect(s.overCause).toBe('done');
    expect(statsOf(s)).toEqual({ score: 140, extinguished: 5, chained: 4 });
  });

  it('时间到 → over time，按已灭数量结算', () => {
    let s = createInitialState({ durationMs: 1_500 });
    s = step(s, { confirm: true, blow: false }, 16).state;
    s = advance(s, COUNTDOWN_MS + 16);
    s = advance(s, BLOW_MS + 32, { confirm: false, blow: true }); // 只灭一支
    s = advance(s, 2_000, IDLE);
    expect(s.phase).toBe('over');
    expect(s.overCause).toBe('time');
    expect(s.extinguished).toBe(1);
    expect(s.score).toBe(CANDLE_POINTS);
  });

  it('没有暂停：状态里不存在 paused 相位', () => {
    expect(createInitialState()).not.toHaveProperty('phaseBeforePause');
    // 输入里也没有 pause 字段（类型层面保证，运行时忽略也安全）
    const s = step(toPlaying(), { confirm: false, blow: false } as CandleGameInput, 16).state;
    expect(s.phase).toBe('playing');
  });

  it('playing 中点头（confirm）没有效果', () => {
    const s = toPlaying();
    const r = step(s, { confirm: true, blow: false }, 16);
    expect(r.state.candles.every((lit) => lit)).toBe(true);
    expect(r.state.score).toBe(0);
  });

  it('dt 钳位：5000ms 只推进 100ms', () => {
    const s0 = toPlaying();
    const s1 = step(s0, { confirm: false, blow: true }, 5000).state;
    expect(s1.elapsedMs - s0.elapsedMs).toBe(MAX_STEP_MS);
    expect(s1.blowMs).toBe(MAX_STEP_MS);
  });

  it('blowMs 不超上限：灭掉一支后进度归零重来', () => {
    let s = toPlaying();
    s = step(s, { confirm: false, blow: true }, 100).state;
    s = step(s, { confirm: false, blow: true }, 100).state;
    s = step(s, { confirm: false, blow: true }, 100).state;
    s = step(s, { confirm: false, blow: true }, 50).state;
    expect(s.blowMs).toBe(350);
    s = step(s, { confirm: false, blow: true }, 100).state;
    expect(s.blowMs).toBe(0); // 溢出部分丢弃，不滚到下一支
    expect(s.candles[0]).toBe(false);
  });

  it('帧间旧状态不被改写（浅拷贝隔离）', () => {
    const s0 = toPlaying();
    const s1 = advance(s0, BLOW_MS + 32, { confirm: false, blow: true });
    expect(s0.candles.every((lit) => lit)).toBe(true);
    expect(s1.candles[0]).toBe(false);
    expect(s0.score).toBe(0);
  });

  it('默认 60 秒时长', () => {
    expect(createInitialState().durationMs).toBe(GAME_DURATION_MS);
  });
});
