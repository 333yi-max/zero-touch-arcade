import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import {
  FIELD_HEIGHT,
  FIELD_WIDTH,
  HEAD_RADIUS,
  ORB_RADIUS,
  type Orb,
  type SnakeGameState,
} from '../game/snakeGame';
import { paintBackdrop } from '../game/backdrop';
import { paintFloatTexts, type FloatText } from '../game/fx';

/** 声音的视觉替身：吃球爆发、闪耀金光、撞自己红光、震屏与飘字。时间戳由调用方在事件发生时打上。 */
export interface SnakeFx {
  eatUntil: number;
  eatAt: { x: number; y: number } | null;
  eatGold: boolean;
  boostUntil: number;
  hitUntil: number;
  shakeUntil: number;
  shakePower: number;
  texts: FloatText[];
}

const EMPTY_FX: SnakeFx = {
  eatUntil: 0,
  eatAt: null,
  eatGold: false,
  boostUntil: 0,
  hitUntil: 0,
  shakeUntil: 0,
  shakePower: 0,
  texts: [],
};

interface SnakeGameProps {
  gameRef: RefObject<SnakeGameState>;
  paused: boolean;
  fxRef: RefObject<SnakeFx>;
  /** 结束页等覆盖层，由调用方决定何时显示。 */
  overlay?: ReactNode;
  /** 摄像头模式下要和预览挤同一屏，画布得矮一点。 */
  frameClass?: string;
}

export default function SnakeGame({ gameRef, paused, fxRef, overlay, frameClass }: SnakeGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedRef.current = mq.matches;
    const onChange = (): void => {
      reducedRef.current = mq.matches;
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    const draw = (): void => {
      const game = gameRef.current;
      const box = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(box.width * dpr));
      const height = Math.max(1, Math.round(box.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const ctx = canvas.getContext('2d');
      if (ctx && game) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, box.width, box.height);
        paintGame(
          ctx,
          box.width,
          box.height,
          game,
          fxRef.current ?? EMPTY_FX,
          performance.now(),
          reducedRef.current,
        );
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [gameRef, fxRef]);

  return (
    <div className={`relative mx-auto aspect-[4/3] w-full shadow-card ${frameClass ?? 'max-h-[60vh]'}`}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="霓虹贪吃蛇游戏画面：左右转头控制蛇的转向，吃下光球得分，点头开启闪耀时刻"
        className="absolute inset-0 h-full w-full rounded-card border-2 border-edge bg-page ring-1 ring-white/5"
      />
      {paused ? (
        <div
          role="status"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-card bg-page/85 backdrop-blur-[2px]"
        >
          <span className="text-4xl font-black">已暂停</span>
          <span className="text-xl font-semibold text-dim">张嘴或点头继续</span>
        </div>
      ) : null}
      {overlay ?? null}
    </div>
  );
}

function wrap(v: number, size: number): number {
  return ((v % size) + size) % size;
}

/** 容器比例和 800×600 不一致时（max-h 生效），逻辑画布居中，左右留边。 */
function paintGame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  s: SnakeGameState,
  fx: SnakeFx,
  now: number,
  reduced: boolean,
): void {
  const scale = Math.min(width / FIELD_WIDTH, height / FIELD_HEIGHT);
  const ox = (width - FIELD_WIDTH * scale) / 2;
  const oy = (height - FIELD_HEIGHT * scale) / 2;

  ctx.fillStyle = '#06080f';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  paintBackdrop(ctx, FIELD_WIDTH, FIELD_HEIGHT, reduced ? 0 : now);

  // 震屏只晃世界元素，背景网格保持稳定，画面不会「整屏在抖」
  if (!reduced && now < fx.shakeUntil) {
    const t = (fx.shakeUntil - now) / 300;
    ctx.translate(
      Math.sin(now * 0.11) * 10 * fx.shakePower * t,
      Math.cos(now * 0.09) * 8 * fx.shakePower * t,
    );
  }

  ctx.strokeStyle = '#2a3550';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 12]);
  ctx.strokeRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
  ctx.setLineDash([]);

  for (const orb of s.orbs) paintOrb(ctx, orb, reduced ? 0 : now);
  paintSnake(ctx, s, reduced ? 0 : now);
  if (!reduced && now < fx.hitUntil) paintHitFlash(ctx, s, 1 - (fx.hitUntil - now) / 350);
  if (!reduced && now < fx.eatUntil && fx.eatAt) {
    paintEatBurst(ctx, fx.eatAt.x, fx.eatAt.y, 1 - (fx.eatUntil - now) / 300, fx.eatGold);
  }
  paintFloatTexts(ctx, fx.texts, now);
  paintPhaseText(ctx, s, reduced ? 0 : now);

  ctx.restore();
}

function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, outer: number): void {
  const inner = outer * 0.45;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function paintOrb(ctx: CanvasRenderingContext2D, orb: Orb, now: number): void {
  const pulse = now > 0 ? 1 + 0.08 * Math.sin(now / 250 + orb.id * 1.7) : 1;
  const r = ORB_RADIUS * pulse;
  ctx.save();
  if (orb.gold) {
    ctx.shadowColor = '#ffd60a';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffe566';
    starPath(ctx, orb.x, orb.y, r + 5);
    ctx.fill();
    // 金星的四芒闪烁：随 now 旋转，reduced 时传 0 不画
    if (now > 0) {
      ctx.translate(orb.x, orb.y);
      ctx.rotate(now / 400);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,244,180,0.8)';
      ctx.lineWidth = 2;
      const spike = ORB_RADIUS + 12 + Math.sin(now / 200) * 3;
      ctx.beginPath();
      ctx.moveTo(-spike, 0);
      ctx.lineTo(spike, 0);
      ctx.moveTo(0, -spike);
      ctx.lineTo(0, spike);
      ctx.stroke();
    }
  } else {
    ctx.shadowColor = '#ffd60a';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffd60a';
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * 蛇身：一节节圆串起来（尾细头粗），每节各自取环面坐标 ——
 * 穿墙时自然断成两段出现在两侧，不需要任何接缝插值。
 * 发光用加法混合的低透明度大圆铺底，只有蛇头用一次 shadowBlur，长蛇也不卡。
 */
function paintSnake(ctx: CanvasRenderingContext2D, s: SnakeGameState, now: number): void {
  const segs = s.segments;
  if (segs.length === 0) return;
  const n = segs.length;
  const comboGlow = 0.08 + Math.min(s.combo, 24) * 0.008;
  const blink = s.invulnMs > 0 && now > 0 ? 0.55 + 0.45 * Math.sin(now / 45) : 1;

  // 发光铺底：加法混合，无 shadowBlur
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(88,196,255,${comboGlow})`;
  for (let i = n - 1; i >= 0; i -= 1) {
    const t = i / Math.max(1, n - 1);
    const radius = 4 + 9 * (1 - t);
    ctx.beginPath();
    ctx.arc(wrap(segs[i].x, FIELD_WIDTH), wrap(segs[i].y, FIELD_HEIGHT), radius * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 蛇身实体：尾 → 头
  for (let i = n - 1; i >= 0; i -= 1) {
    const t = i / Math.max(1, n - 1);
    const radius = 4 + 9 * (1 - t);
    ctx.globalAlpha = blink;
    ctx.fillStyle = i === 0 ? '#c9ecff' : '#58c4ff';
    ctx.beginPath();
    ctx.arc(wrap(segs[i].x, FIELD_WIDTH), wrap(segs[i].y, FIELD_HEIGHT), radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 闪耀时刻：头部的金色光晕 + 身后几点拖尾火花
  if (s.boostMs > 0 && now > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const head = segs[0];
    const hx = wrap(head.x, FIELD_WIDTH);
    const hy = wrap(head.y, FIELD_HEIGHT);
    ctx.fillStyle = `rgba(255,214,10,${0.25 + 0.15 * Math.sin(now / 90)})`;
    ctx.beginPath();
    ctx.arc(hx, hy, HEAD_RADIUS * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,229,102,0.55)';
    for (let i = 1; i <= Math.min(5, n - 1); i += 1) {
      const spark = segs[i];
      const flick = 0.5 + 0.5 * Math.sin(now / 60 + i * 2.1);
      ctx.globalAlpha = flick * (1 - i / 6);
      ctx.beginPath();
      ctx.arc(wrap(spark.x, FIELD_WIDTH), wrap(spark.y, FIELD_HEIGHT), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  paintHeadEyes(ctx, s);
}

/** 眼睛沿朝向方向：heading 0 时朝右，两眼在垂直于朝向的两侧。 */
function paintHeadEyes(ctx: CanvasRenderingContext2D, s: SnakeGameState): void {
  const head = s.segments[0];
  const hx = wrap(head.x, FIELD_WIDTH);
  const hy = wrap(head.y, FIELD_HEIGHT);
  const dx = Math.cos(s.heading);
  const dy = Math.sin(s.heading);
  const px = -dy;
  const py = dx;
  const ahead = 4;
  const side = 5;
  ctx.fillStyle = '#0a0f1f';
  for (const sign of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(hx + dx * ahead + px * side * sign, hy + dy * ahead + py * side * sign, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 吃球爆发：外扩圆环 + 确定性散开的火花，金球更盛。 */
function paintEatBurst(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, gold: boolean): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = gold ? '#ffe566' : '#ffd60a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 8 + 46 * t, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#ffd60a';
  const spread = 10 + 34 * t;
  const count = gold ? 12 : 8;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + x * 0.017;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * spread, y + Math.sin(angle) * spread, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 撞自己的红光：头部红色冲击环 + 白芯一闪。 */
function paintHitFlash(ctx: CanvasRenderingContext2D, s: SnakeGameState, t: number): void {
  const head = s.segments[0];
  const x = wrap(head.x, FIELD_WIDTH);
  const y = wrap(head.y, FIELD_HEIGHT);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = '#ff5060';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, 10 + 60 * t, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - t)})`;
  ctx.beginPath();
  ctx.arc(x, y, HEAD_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintPhaseText(ctx: CanvasRenderingContext2D, s: SnakeGameState, now: number): void {
  ctx.textAlign = 'center';
  if (s.phase === 'ready') {
    ctx.fillStyle = '#c3cde4';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText('点头或眨眼开始', FIELD_WIDTH / 2, FIELD_HEIGHT / 2 - 40);
  } else if (s.phase === 'countdown') {
    const pulse = now > 0 ? 1 + 0.06 * Math.sin(now / 150) : 1;
    ctx.save();
    ctx.translate(FIELD_WIDTH / 2, FIELD_HEIGHT / 2);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = '#ffd60a';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffd60a';
    ctx.font = '900 96px system-ui, sans-serif';
    ctx.fillText(String(Math.ceil(s.countdownMs / 1000)), 0, 0);
    ctx.restore();
  }
}
