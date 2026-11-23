import { clamp } from '../input/config';

// ———— 逻辑常量（全部可被单测直接引用）————

export const FIELD_WIDTH = 800;
export const FIELD_HEIGHT = 600;
export const SEG_GAP = 12;
export const START_LENGTH = 8;
export const MIN_LENGTH = 6;
export const HEAD_RADIUS = 13;
export const ORB_RADIUS = 13;
export const BASE_SPEED = 120;
export const SPEED_PER_ORB = 3;
export const MAX_SPEED = 190;
/** cursorX=±1 时的满转向速率（弧度/秒）。 */
export const TURN_RATE = 2.3;
export const MAX_ORBS = 3;
export const ORB_INTERVAL_MS = 1400;
export const ORB_SPAWN_MARGIN = 60;
export const GOLD_EVERY = 5;
export const ORB_POINTS = 10;
export const GOLD_POINTS = 40;
export const COMBO_PER_MULTIPLIER = 3;
export const MAX_MULTIPLIER = 5;
export const COMBO_WINDOW_MS = 6000;
/** 点头「闪耀时刻」：只翻倍得分、不加速度 —— 误触发也不会更难控制。 */
export const BOOST_MS = 1500;
export const BOOST_CD_MS = 3000;
export const INVULN_MS = 1200;
/** 头后面这么近的几节不参与撞自己判定：正常转弯必然贴着自己。 */
export const SELF_HIT_SAFE_SEGMENTS = 8;
export const SELF_HIT_KEEP_RATIO = 0.5;
export const GAME_DURATION_MS = 90_000;
export const COUNTDOWN_MS = 3_000;
/** 单步 dt 上限：切后台再回来不该瞬移一屏。 */
export const MAX_STEP_MS = 100;

export type SnakePhase = 'ready' | 'countdown' | 'playing' | 'paused' | 'over';

export interface Point {
  x: number;
  y: number;
}

export interface Orb {
  id: number;
  x: number;
  y: number;
  gold: boolean;
}

export interface SnakeGameStats {
  eaten: number;
  golds: number;
  maxLength: number;
  maxCombo: number;
  score: number;
}

export interface SnakeGameInput {
  cursorX: number;
  confirm: boolean;
  pause: boolean;
}

export interface SnakeGameState {
  phase: SnakePhase;
  /** 暂停前的相位，恢复时回去。 */
  phaseBeforePause: 'countdown' | 'playing';
  elapsedMs: number;
  countdownMs: number;
  /** 蛇头走过的路径（坐标不卷绕，跨边不跳变），头在 [0]；体节位置从它上面按弧长采样。 */
  path: Point[];
  /** 每帧由 path 重算：头在 [0]，间距 SEG_GAP。 */
  segments: Point[];
  heading: number;
  speed: number;
  score: number;
  combo: number;
  /** 距上次吃到的毫秒数，超过 COMBO_WINDOW_MS 连击清零。 */
  comboMs: number;
  maxCombo: number;
  boostMs: number;
  boostCdMs: number;
  invulnMs: number;
  orbs: Orb[];
  spawnTimerMs: number;
  spawnedCount: number;
  nextId: number;
  eaten: number;
  golds: number;
  maxLength: number;
  prevConfirm: boolean;
  prevPause: boolean;
  /** 随机源由调用方注入；测试传固定种子，游戏传 Math.random。 */
  rand: () => number;
  durationMs: number;
}

export type SnakeGameEvent =
  | { type: 'phase'; phase: SnakePhase }
  | { type: 'countdown'; remaining: number }
  | {
      type: 'eat';
      id: number;
      gold: boolean;
      points: number;
      multiplier: number;
      combo: number;
      score: number;
      x: number;
      y: number;
      length: number;
    }
  | { type: 'selfHit'; length: number; comboBefore: number; x: number; y: number }
  | { type: 'boostStart' }
  | { type: 'gameOver'; cause: 'time'; stats: SnakeGameStats };

export interface SnakeGameOptions {
  rand?: () => number;
  durationMs?: number;
}

export function multiplierFor(combo: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / COMBO_PER_MULTIPLIER));
}

/** 环面（穿墙）坐标差：|a-b| 取短边。 */
export function torusDx(a: number, b: number, size: number): number {
  let d = Math.abs(a - b);
  if (d > size / 2) d = size - d;
  return d;
}

export function torusDist(a: Point, b: Point): number {
  return Math.hypot(torusDx(a.x, b.x, FIELD_WIDTH), torusDx(a.y, b.y, FIELD_HEIGHT));
}

/** 角度差归一到 (-π, π]。 */
export function angleDiff(target: number, current: number): number {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function statsOf(s: SnakeGameState): SnakeGameStats {
  return {
    eaten: s.eaten,
    golds: s.golds,
    maxLength: s.maxLength,
    maxCombo: s.maxCombo,
    score: s.score,
  };
}

export function createInitialState(options: SnakeGameOptions = {}): SnakeGameState {
  // 头在场地中央朝右，身体向左排开
  const path: Point[] = [];
  for (let i = 0; i < START_LENGTH; i += 1) {
    path.push({ x: FIELD_WIDTH / 2 - i * SEG_GAP, y: FIELD_HEIGHT / 2 });
  }
  return {
    phase: 'ready',
    phaseBeforePause: 'playing',
    elapsedMs: 0,
    countdownMs: 0,
    path,
    segments: [...path],
    heading: 0,
    speed: BASE_SPEED,
    score: 0,
    combo: 0,
    comboMs: 0,
    maxCombo: 0,
    boostMs: 0,
    boostCdMs: 0,
    invulnMs: 0,
    orbs: [],
    spawnTimerMs: 0,
    spawnedCount: 0,
    nextId: 1,
    eaten: 0,
    golds: 0,
    maxLength: START_LENGTH,
    prevConfirm: false,
    prevPause: false,
    rand: options.rand ?? Math.random,
    durationMs: options.durationMs ?? GAME_DURATION_MS,
  };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 沿 path 按弧长间隔 SEG_GAP 采样 count 个点（头 = path[0]）。 */
function sampleSegments(path: readonly Point[], count: number): Point[] {
  const out: Point[] = [];
  let acc = 0;
  let idx = 0;
  for (let i = 0; i < count; i += 1) {
    const target = i * SEG_GAP;
    while (idx < path.length - 2 && acc + dist(path[idx], path[idx + 1]) < target) {
      acc += dist(path[idx], path[idx + 1]);
      idx += 1;
    }
    const p0 = path[idx];
    const p1 = path[idx + 1];
    const d = dist(p0, p1);
    const t = d === 0 ? 0 : (target - acc) / d;
    out.push({ x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t });
  }
  return out;
}

/** 只保留弧长 needed 以内的路径点（至少两点，插值才不会越界）。 */
function trimPath(path: readonly Point[], needed: number): Point[] {
  const out: Point[] = [path[0]];
  let acc = 0;
  for (let i = 1; i < path.length; i += 1) {
    acc += dist(path[i - 1], path[i]);
    if (acc > needed) break;
    out.push(path[i]);
  }
  if (out.length === 1 && path.length > 1) out.push(path[1]);
  return out;
}

function spawnOrb(s: SnakeGameState): Orb {
  const orb: Orb = {
    id: s.nextId,
    x: ORB_SPAWN_MARGIN + s.rand() * (FIELD_WIDTH - ORB_SPAWN_MARGIN * 2),
    y: ORB_SPAWN_MARGIN + s.rand() * (FIELD_HEIGHT - ORB_SPAWN_MARGIN * 2),
    gold: s.spawnedCount % GOLD_EVERY === 0,
  };
  s.nextId += 1;
  return orb;
}

/**
 * 纯函数推进一帧。时间只来自 dtMs，逻辑里没有任何 Date.now / performance.now。
 * 规则（舒适向）：计时抢分、不会死；吃球加分加长、微加速；撞到自己只扣一半长度断连击；
 * 点头 = 闪耀时刻（1.5 秒内得分翻倍，不加速）；张嘴 = 暂停；边界穿墙。
 */
export function step(
  s: SnakeGameState,
  input: SnakeGameInput,
  dtMs: number,
): { state: SnakeGameState; events: SnakeGameEvent[] } {
  const dt = clamp(dtMs, 0, MAX_STEP_MS);
  const confirmEdge = input.confirm && !s.prevConfirm;
  const pauseEdge = input.pause && !s.prevPause;

  const st: SnakeGameState = {
    ...s,
    prevConfirm: input.confirm,
    prevPause: input.pause,
  };
  const events: SnakeGameEvent[] = [];

  switch (st.phase) {
    case 'ready': {
      if (confirmEdge) {
        st.phase = 'countdown';
        st.countdownMs = COUNTDOWN_MS;
        events.push({ type: 'phase', phase: 'countdown' }, { type: 'countdown', remaining: 3 });
      }
      return { state: st, events };
    }

    case 'countdown': {
      if (pauseEdge) {
        st.phaseBeforePause = 'countdown';
        st.phase = 'paused';
        events.push({ type: 'phase', phase: 'paused' });
        return { state: st, events };
      }
      const before = Math.ceil(st.countdownMs / 1000);
      st.countdownMs -= dt;
      const after = Math.ceil(Math.max(st.countdownMs, 0) / 1000);
      if (after < before) events.push({ type: 'countdown', remaining: after });
      if (st.countdownMs <= 0) {
        st.phase = 'playing';
        events.push({ type: 'phase', phase: 'playing' });
      }
      return { state: st, events };
    }

    case 'paused': {
      // 张嘴再触发一次，或点头/眨眼，都恢复；恢复用的 confirm 不作用于游戏内
      if (pauseEdge || confirmEdge) {
        st.phase = st.phaseBeforePause;
        events.push({ type: 'phase', phase: st.phase });
      }
      return { state: st, events };
    }

    case 'playing': {
      if (pauseEdge) {
        st.phaseBeforePause = 'playing';
        st.phase = 'paused';
        events.push({ type: 'phase', phase: 'paused' });
        return { state: st, events };
      }

      st.elapsedMs += dt;
      if (st.elapsedMs >= st.durationMs) {
        st.phase = 'over';
        events.push({ type: 'gameOver', cause: 'time', stats: statsOf(st) });
        return { state: st, events };
      }

      // 点头 = 闪耀时刻：得分翻倍（不加速度，误触发无代价）
      if (st.boostMs > 0) st.boostMs = Math.max(0, st.boostMs - dt);
      if (st.boostCdMs > 0) st.boostCdMs = Math.max(0, st.boostCdMs - dt);
      if (confirmEdge && st.boostMs <= 0 && st.boostCdMs <= 0) {
        st.boostMs = BOOST_MS;
        st.boostCdMs = BOOST_MS + BOOST_CD_MS;
        events.push({ type: 'boostStart' });
      }

      // 转向 + 前进：头部坐标不卷绕，跨边不跳变，体节采样不会穿屏
      st.heading += clamp(input.cursorX, -1, 1) * TURN_RATE * (dt / 1000);
      const v = (st.speed * dt) / 1000;
      const head: Point = {
        x: st.segments[0].x + Math.cos(st.heading) * v,
        y: st.segments[0].y + Math.sin(st.heading) * v,
      };
      st.path = trimPath([head, ...st.path], st.segments.length * SEG_GAP + 60);
      st.segments = sampleSegments(st.path, st.segments.length);

      // 吃球
      st.orbs = st.orbs.filter((orb) => {
        if (torusDist(head, orb) >= HEAD_RADIUS + ORB_RADIUS) return true;
        const gold = orb.gold;
        const count = st.segments.length + (gold ? 3 : 2);
        // 路径保留更多历史后重采样：尾巴沿旧轨迹平滑延长，头不动
        st.path = trimPath(st.path, count * SEG_GAP + 60);
        st.segments = sampleSegments(st.path, count);
        st.eaten += 1;
        if (gold) st.golds += 1;
        st.speed = Math.min(MAX_SPEED, st.speed + SPEED_PER_ORB);
        st.maxLength = Math.max(st.maxLength, count);
        st.combo += 1;
        st.comboMs = COMBO_WINDOW_MS;
        if (st.combo > st.maxCombo) st.maxCombo = st.combo;
        const mult = multiplierFor(st.combo);
        const base = gold ? GOLD_POINTS : ORB_POINTS;
        const points = base * mult * (st.boostMs > 0 ? 2 : 1);
        st.score += points;
        events.push({
          type: 'eat',
          id: orb.id,
          gold,
          points,
          multiplier: mult,
          combo: st.combo,
          score: st.score,
          x: orb.x,
          y: orb.y,
          length: count,
        });
        return false;
      });

      // 连击窗口：超过时限没吃到就清零（HUD 自动反映，无需事件）
      if (st.combo > 0) {
        st.comboMs -= dt;
        if (st.comboMs <= 0) st.combo = 0;
      }

      // 撞自己：只扣一半长度断连击，不会死
      if (st.invulnMs > 0) {
        st.invulnMs = Math.max(0, st.invulnMs - dt);
      } else {
        for (let i = SELF_HIT_SAFE_SEGMENTS; i < st.segments.length; i += 1) {
          const seg = st.segments[i];
          const t = i / Math.max(1, st.segments.length - 1);
          const radius = 4 + 7 * (1 - t);
          if (torusDist(head, seg) < HEAD_RADIUS + radius - 2) {
            const keep = Math.max(MIN_LENGTH, Math.floor(st.segments.length * SELF_HIT_KEEP_RATIO));
            st.segments = st.segments.slice(0, keep);
            st.path = trimPath(st.path, keep * SEG_GAP + 60);
            st.invulnMs = INVULN_MS;
            events.push({
              type: 'selfHit',
              length: keep,
              comboBefore: st.combo,
              x: ((head.x % FIELD_WIDTH) + FIELD_WIDTH) % FIELD_WIDTH,
              y: ((head.y % FIELD_HEIGHT) + FIELD_HEIGHT) % FIELD_HEIGHT,
            });
            st.combo = 0;
            st.comboMs = 0;
            break;
          }
        }
      }

      // 生成球：场上保持最多 MAX_ORBS 颗，离头太近的位置重试几次
      st.spawnTimerMs += dt;
      while (st.spawnTimerMs >= ORB_INTERVAL_MS && st.orbs.length < MAX_ORBS) {
        st.spawnTimerMs -= ORB_INTERVAL_MS;
        st.spawnedCount += 1;
        let orb = spawnOrb(st);
        for (let tries = 0; tries < 8 && torusDist(head, orb) < 180; tries += 1) {
          orb = spawnOrb(st);
        }
        st.orbs = [...st.orbs, orb];
      }

      return { state: st, events };
    }

    case 'over':
      return { state: st, events };
  }
}
