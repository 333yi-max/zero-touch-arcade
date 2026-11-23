import { describe, expect, it } from 'vitest';
import {
  BASE_SPEED,
  BOOST_MS,
  COMBO_PER_MULTIPLIER,
  COMBO_WINDOW_MS,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  GOLD_POINTS,
  INVULN_MS,
  MAX_MULTIPLIER,
  MIN_LENGTH,
  ORB_POINTS,
  SEG_GAP,
  SPEED_PER_ORB,
  START_LENGTH,
  angleDiff,
  createInitialState,
  multiplierFor,
  step,
  statsOf,
  torusDx,
  type Point,
  type SnakeGameState,
} from '../src/game/snakeGame';

/** 线性同余发生器：测试里所有“随机”都是可重放的。 */
function seededRand(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

function playingState(): SnakeGameState {
  return { ...createInitialState({ rand: seededRand(7) }), phase: 'playing' };
}

/** 往头正前方塞一颗球，跳过生成节拍。 */
function withOrbAhead(s: SnakeGameState, dx = 20, gold = false): SnakeGameState {
  const head = s.segments[0];
  return { ...s, orbs: [...s.orbs, { id: 99, x: head.x + dx, y: head.y, gold }] };
}

const IDLE = { cursorX: 0, confirm: false, pause: false };

describe('game/snakeGame', () => {
  it('初始状态：ready、8 节、头在场地中央朝右', () => {
    const s = createInitialState();
    expect(s.phase).toBe('ready');
    expect(s.segments).toHaveLength(START_LENGTH);
    expect(s.segments[0]).toEqual({ x: 400, y: 300 });
    expect(s.segments[1].x).toBeCloseTo(400 - SEG_GAP, 5);
    expect(s.heading).toBe(0);
    expect(s.speed).toBe(BASE_SPEED);
  });

  it('环面坐标差：取短边', () => {
    expect(torusDx(790, 10, FIELD_WIDTH)).toBe(20);
    expect(torusDx(10, 790, FIELD_WIDTH)).toBe(20);
    expect(torusDx(400, 400, FIELD_WIDTH)).toBe(0);
    expect(torusDx(100, 300, FIELD_WIDTH)).toBe(200);
  });

  it('角度差归一到 (-π, π]', () => {
    expect(angleDiff(3.1, -3.0)).toBeCloseTo(-0.183, 2);
    expect(angleDiff(-3.0, 3.1)).toBeCloseTo(0.183, 2);
    expect(angleDiff(0.5, 0.5)).toBe(0);
  });

  it('点头开始 → 3 秒倒计时 → 进入 playing', () => {
    let s = createInitialState();
    const start = step(s, { ...IDLE, confirm: true }, 16);
    expect(start.state.phase).toBe('countdown');
    expect(start.events).toContainEqual({ type: 'countdown', remaining: 3 });

    s = start.state;
    for (let i = 0; i < 188; i += 1) s = step(s, IDLE, 16).state;
    expect(s.phase).toBe('playing');
  });

  it('前进：头按 speed×dt 移动，身体沿路径跟在后面', () => {
    const r = step(playingState(), IDLE, 16);
    const head = r.state.segments[0];
    expect(head.x).toBeCloseTo(400 + (BASE_SPEED * 16) / 1000, 5);
    expect(head.y).toBeCloseTo(300, 5);
    // 第二节离头恰好一节间距
    const second = r.state.segments[1];
    expect(Math.hypot(second.x - head.x, second.y - head.y)).toBeCloseTo(SEG_GAP, 4);
  });

  it('转向：cursorX=1 右转，heading 增大', () => {
    const before = playingState().heading;
    const after = step(playingState(), { ...IDLE, cursorX: 1 }, 100).state.heading;
    expect(after).toBeGreaterThan(before);
  });

  it('吃普通球：+10 分、长 2 节、提速、连击 1', () => {
    const r = step(withOrbAhead(playingState()), IDLE, 16);
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: 'eat', gold: false, points: ORB_POINTS, combo: 1, length: START_LENGTH + 2 }),
    );
    expect(r.state.score).toBe(ORB_POINTS);
    expect(r.state.eaten).toBe(1);
    expect(r.state.segments).toHaveLength(START_LENGTH + 2);
    expect(r.state.speed).toBe(BASE_SPEED + SPEED_PER_ORB);
    expect(r.state.maxLength).toBe(START_LENGTH + 2);
  });

  it('吃金球：+40 分、长 3 节', () => {
    const r = step(withOrbAhead(playingState(), 20, true), IDLE, 16);
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: 'eat', gold: true, points: GOLD_POINTS, length: START_LENGTH + 3 }),
    );
    expect(r.state.score).toBe(GOLD_POINTS);
    expect(r.state.golds).toBe(1);
  });

  it('连击倍率：每 3 连击升一档，封顶 ×5', () => {
    expect(multiplierFor(0)).toBe(1);
    expect(multiplierFor(2)).toBe(1);
    expect(multiplierFor(COMBO_PER_MULTIPLIER)).toBe(2);
    expect(multiplierFor(12)).toBe(MAX_MULTIPLIER);
    expect(multiplierFor(99)).toBe(MAX_MULTIPLIER);
  });

  it('连击过期：COMBO_WINDOW 内没吃到就清零', () => {
    let s = step(withOrbAhead(playingState()), IDLE, 16).state;
    expect(s.combo).toBe(1);
    // 手动清掉场上新生成的球，保证这 6 秒里一口都吃不到
    for (let i = 0; i < Math.ceil(COMBO_WINDOW_MS / 16) + 4; i += 1) {
      s = step(s, IDLE, 16).state;
      s.orbs = [];
    }
    expect(s.combo).toBe(0);
  });

  it('点头 = 闪耀时刻：得分翻倍、有冷却、不加速', () => {
    let s = playingState();
    const boosted = step(s, { ...IDLE, confirm: true }, 16);
    expect(boosted.events).toContainEqual({ type: 'boostStart' });
    s = boosted.state;
    expect(s.boostMs).toBe(BOOST_MS);
    const speedBefore = s.speed;

    const eat = step(withOrbAhead(s), IDLE, 16);
    expect(eat.state.score).toBe(ORB_POINTS * 2);
    expect(eat.state.speed).toBe(speedBefore + SPEED_PER_ORB);
    // 闪耀中再点头不叠
    const again = step(eat.state, { ...IDLE, confirm: true }, 16);
    expect(again.events.filter((e) => e.type === 'boostStart')).toHaveLength(0);
  });

  it('撞自己：只扣一半长度断连击，不死、无敌 1.2 秒', () => {
    // 手动把蛇摆成 25 节绕圆周：尾部刚好转到头旁边，下一步必然撞上
    const s = playingState();
    const cx = 400;
    const cy = 300;
    const r = 45;
    const n = 25;
    const segs: Point[] = [];
    for (let i = 0; i < n; i += 1) {
      const a = -i * (SEG_GAP / r);
      segs.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    s.segments = [...segs];
    s.path = [...segs];
    s.heading = Math.PI / 2 + SEG_GAP / r;
    s.combo = 3;
    s.comboMs = COMBO_WINDOW_MS;

    const hit = step(s, IDLE, 16);
    expect(hit.events).toContainEqual(
      expect.objectContaining({ type: 'selfHit', length: Math.max(MIN_LENGTH, Math.floor(n / 2)), comboBefore: 3 }),
    );
    expect(hit.state.phase).toBe('playing');
    expect(hit.state.combo).toBe(0);
    expect(hit.state.invulnMs).toBe(INVULN_MS);
    // 无敌期内再撞不触发
    const second = step(hit.state, IDLE, 16);
    expect(second.events.filter((e) => e.type === 'selfHit')).toHaveLength(0);
  });

  it('张嘴暂停，再张嘴或点头恢复', () => {
    let s = step(playingState(), { ...IDLE, pause: true }, 16).state;
    expect(s.phase).toBe('paused');
    s = step(s, IDLE, 16).state;
    expect(s.phase).toBe('paused');
    s = step(s, { ...IDLE, confirm: true }, 16).state;
    expect(s.phase).toBe('playing');
  });

  it('生成球：每 1.4 秒补到场上最多 3 颗，位置在场地内', () => {
    let s = playingState();
    for (let i = 0; i < Math.ceil(1400 / 16) * 3 + 4; i += 1) {
      s = step(s, IDLE, 16).state;
    }
    expect(s.orbs.length).toBe(3);
    for (const orb of s.orbs) {
      expect(orb.x).toBeGreaterThanOrEqual(0);
      expect(orb.x).toBeLessThan(FIELD_WIDTH);
      expect(orb.y).toBeGreaterThanOrEqual(0);
      expect(orb.y).toBeLessThan(FIELD_HEIGHT);
    }
  });

  it('时间到：over + 结算统计，之后不再推进', () => {
    const s: SnakeGameState = {
      ...createInitialState({ rand: seededRand(7), durationMs: 100 }),
      phase: 'playing',
      elapsedMs: 50,
    };
    const r = step(s, IDLE, 60);
    expect(r.state.phase).toBe('over');
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'gameOver', cause: 'time' }));
    const stats = statsOf(r.state);
    expect(stats.score).toBe(0);

    const headBefore = r.state.segments[0];
    const after = step(r.state, { ...IDLE, cursorX: 1 }, 100).state;
    expect(after.segments[0]).toEqual(headBefore);
  });

  it('dt 上限：大间隔被钳到 MAX_STEP，不会瞬移一屏', () => {
    const r = step(playingState(), IDLE, 10_000);
    const head = r.state.segments[0];
    expect(head.x - 400).toBeLessThanOrEqual(BASE_SPEED * 0.1 + 0.001);
  });
});
