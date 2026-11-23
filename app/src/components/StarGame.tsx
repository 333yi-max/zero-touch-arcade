import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  PADDLE_HEIGHT,
  PADDLE_WIDTH,
  PADDLE_Y,
  STAR_RADIUS,
  type StarGameState,
  type Star,
} from '../game/starGame';

/** 声音的视觉替身：接住爆发、漏掉红光。时间戳由调用方在事件发生时打上。 */
export interface GameFx {
  catchUntil: number;
  catchAt: { x: number; y: number } | null;
  missUntil: number;
}

const EMPTY_FX: GameFx = { catchUntil: 0, catchAt: null, missUntil: 0 };

interface StarGameProps {
  gameRef: RefObject<StarGameState>;
  paused: boolean;
  fxRef: RefObject<GameFx>;
  /** 结束页等覆盖层，由调用方决定何时显示。 */
  overlay?: ReactNode;
}

export default function StarGame({ gameRef, paused, fxRef, overlay }: StarGameProps) {
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
    <div className="relative mx-auto aspect-[4/3] max-h-[60vh] w-full">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="接星星游戏画面：左右转头移动底部蓝色挡板，接住落下的黄色星星"
        className="absolute inset-0 h-full w-full rounded-card border-2 border-edge bg-page"
      />
      {paused ? (
        <div
          role="status"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-card bg-page/85"
        >
          <span className="text-4xl font-black">已暂停</span>
          <span className="text-xl font-semibold text-dim">张嘴或点头继续</span>
        </div>
      ) : null}
      {overlay ?? null}
    </div>
  );
}

/** 容器比例和 800×600 不一致时（max-h 生效），逻辑画布居中，左右留边。 */
function paintGame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  s: StarGameState,
  fx: GameFx,
  now: number,
  reduced: boolean,
): void {
  const scale = Math.min(width / GAME_WIDTH, height / GAME_HEIGHT);
  const ox = (width - GAME_WIDTH * scale) / 2;
  const oy = (height - GAME_HEIGHT * scale) / 2;

  ctx.fillStyle = '#06080f';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  ctx.strokeStyle = '#2a3550';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 12]);
  ctx.strokeRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  ctx.setLineDash([]);

  for (const star of s.stars) paintStar(ctx, star);

  if (!reduced && now < fx.missUntil) paintMissFlash(ctx, 1 - (fx.missUntil - now) / 350);
  paintPaddle(ctx, s.paddleX, s.combo, reduced, !reduced && now < fx.missUntil ? shakeOf(now) : 0);
  if (!reduced && now < fx.catchUntil && fx.catchAt) {
    paintCatchBurst(ctx, fx.catchAt.x, fx.catchAt.y, 1 - (fx.catchUntil - now) / 300);
  }
  paintPhaseText(ctx, s);

  ctx.restore();
}

function shakeOf(now: number): number {
  return Math.sin(now / 8) * 6;
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

function paintStar(ctx: CanvasRenderingContext2D, star: Star): void {
  ctx.save();
  if (star.gold) {
    ctx.shadowColor = '#ffd60a';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffe566';
    starPath(ctx, star.x, star.y, STAR_RADIUS + 5);
  } else {
    ctx.shadowColor = '#ffd60a';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffd60a';
    starPath(ctx, star.x, star.y, STAR_RADIUS);
  }
  ctx.fill();
  ctx.restore();
}

function paintPaddle(
  ctx: CanvasRenderingContext2D,
  paddleX: number,
  combo: number,
  reduced: boolean,
  shakeX: number,
): void {
  ctx.save();
  ctx.shadowColor = '#58c4ff';
  ctx.shadowBlur = reduced ? 12 : 12 + Math.min(combo, 24) * 1.5;
  ctx.fillStyle = '#58c4ff';
  ctx.beginPath();
  ctx.roundRect(
    paddleX + shakeX - PADDLE_WIDTH / 2,
    PADDLE_Y,
    PADDLE_WIDTH,
    PADDLE_HEIGHT,
    PADDLE_HEIGHT / 2,
  );
  ctx.fill();
  ctx.restore();
}

/** 漏掉的红光：底部一条由深到浅的红带。 */
function paintMissFlash(ctx: CanvasRenderingContext2D, t: number): void {
  const band = ctx.createLinearGradient(0, GAME_HEIGHT - 90, 0, GAME_HEIGHT);
  band.addColorStop(0, 'rgba(255,80,80,0)');
  band.addColorStop(1, `rgba(255,80,80,${0.45 * t})`);
  ctx.fillStyle = band;
  ctx.fillRect(0, GAME_HEIGHT - 90, GAME_WIDTH, 90);
}

/**
 * 接住的爆发：外扩圆环 + 确定性散开的 10 粒火花。
 * 粒子方向由固定角度表给出，跟帧率无关。
 */
function paintCatchBurst(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = '#ffe566';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 8 + 46 * t, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#ffd60a';
  const spread = 10 + 34 * t;
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2 + x * 0.017;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * spread, y + Math.sin(angle) * spread, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintPhaseText(ctx: CanvasRenderingContext2D, s: StarGameState): void {
  ctx.textAlign = 'center';
  if (s.phase === 'ready') {
    ctx.fillStyle = '#c3cde4';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText('点头或眨眼开始', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40);
  } else if (s.phase === 'countdown') {
    ctx.fillStyle = '#ffd60a';
    ctx.font = '900 96px system-ui, sans-serif';
    ctx.fillText(String(Math.ceil(s.countdownMs / 1000)), GAME_WIDTH / 2, GAME_HEIGHT / 2);
  }
}
