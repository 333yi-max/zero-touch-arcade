import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  HOLE_POSITIONS,
  HOLE_RADIUS,
  type WhackGameState,
  whackPathPoint,
} from '../game/whackGame';
import { paintBackdrop } from '../game/backdrop';
import { paintFloatTexts, type FloatText } from '../game/fx';

/** 声音的视觉替身：敲中爆发、敲空红叉、缩回红圈、震屏与飘字。 */
export interface WhackFx {
  hitUntil: number;
  hitAt: { x: number; y: number } | null;
  hitGold: boolean;
  whiffUntil: number;
  whiffAt: { x: number; y: number } | null;
  retreatUntil: number;
  retreatAt: { x: number; y: number } | null;
  shakeUntil: number;
  shakePower: number;
  texts: FloatText[];
}

const EMPTY_FX: WhackFx = {
  hitUntil: 0,
  hitAt: null,
  hitGold: false,
  whiffUntil: 0,
  whiffAt: null,
  retreatUntil: 0,
  retreatAt: null,
  shakeUntil: 0,
  shakePower: 0,
  texts: [],
};

const MOLE_LIFT_PX = 46;

interface WhackGameProps {
  gameRef: RefObject<WhackGameState>;
  paused: boolean;
  fxRef: RefObject<WhackFx>;
  /** 结束页等覆盖层，由调用方决定何时显示。 */
  overlay?: ReactNode;
  /** 摄像头模式下要和预览挤同一屏，画布得矮一点。 */
  frameClass?: string;
}

export default function WhackGame({ gameRef, paused, fxRef, overlay, frameClass }: WhackGameProps) {
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
        aria-label="打地鼠游戏画面：左右转头移动蓝色准星，对准冒头的地鼠点头敲击"
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

function paintGame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  s: WhackGameState,
  fx: WhackFx,
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

  paintBackdrop(ctx, GAME_WIDTH, GAME_HEIGHT, reduced ? 0 : now);

  if (!reduced && now < fx.shakeUntil) {
    const t = (fx.shakeUntil - now) / 300;
    ctx.translate(
      Math.sin(now * 0.11) * 9 * fx.shakePower * t,
      Math.cos(now * 0.09) * 7 * fx.shakePower * t,
    );
  }

  ctx.strokeStyle = '#2a3550';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 12]);
  ctx.strokeRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  ctx.setLineDash([]);

  paintPath(ctx);
  for (let i = 0; i < HOLE_POSITIONS.length; i += 1) paintHole(ctx, i);
  for (let i = 0; i < s.moles.length; i += 1) {
    const mole = s.moles[i];
    if (mole.visible) paintMole(ctx, i, mole.gold, mole.leftMs / mole.lifeMs, reduced ? 0 : now);
  }

  if (!reduced && now < fx.retreatUntil && fx.retreatAt) {
    paintRetreatRing(ctx, fx.retreatAt.x, fx.retreatAt.y, 1 - (fx.retreatUntil - now) / 320);
  }
  if (!reduced && now < fx.hitUntil && fx.hitAt) {
    paintHitBurst(ctx, fx.hitAt.x, fx.hitAt.y, 1 - (fx.hitUntil - now) / 300, fx.hitGold);
  }
  if (!reduced && now < fx.whiffUntil && fx.whiffAt) {
    paintWhiffX(ctx, fx.whiffAt.x, fx.whiffAt.y, 1 - (fx.whiffUntil - now) / 320);
  }

  paintCrosshair(ctx, s.cursorX, s.combo, reduced ? 0 : now);
  paintFloatTexts(ctx, fx.texts, now);
  paintPhaseText(ctx, s, reduced ? 0 : now);

  ctx.restore();
}

/** 蛇形路径：把一维准星和 9 个洞的连线画出来，让玩家看懂映射。 */
function paintPath(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(88,196,255,0.14)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 10]);
  ctx.beginPath();
  HOLE_POSITIONS.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function paintHole(ctx: CanvasRenderingContext2D, i: number): void {
  const [x, y] = HOLE_POSITIONS[i];
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y, HOLE_RADIUS, HOLE_RADIUS * 0.42, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#070b14';
  ctx.fill();
  ctx.strokeStyle = '#2a3550';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y + 2, HOLE_RADIUS - 10, (HOLE_RADIUS - 10) * 0.38, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(88,196,255,0.18)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

/** 地鼠：前 15% 冒出、后 15% 缩回，中间挺着。progress = leftMs / lifeMs。 */
function paintMole(ctx: CanvasRenderingContext2D, i: number, gold: boolean, progress: number, now: number): void {
  const [x, holeY] = HOLE_POSITIONS[i];
  const rise = Math.min(1, (1 - progress) / 0.15);
  const sink = Math.min(1, progress / 0.15);
  const lift = Math.min(rise, sink);
  const eased = lift * lift * (3 - 2 * lift);
  const y = holeY - eased * MOLE_LIFT_PX;
  const body = gold ? '#ffd60a' : '#8a5a3b';
  const belly = gold ? '#ffe566' : '#b07a52';

  ctx.save();
  ctx.shadowColor = body;
  ctx.shadowBlur = gold ? 18 : 8;

  // 身体
  ctx.beginPath();
  ctx.ellipse(x, y, 30, 34, 0, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();

  // 肚皮 + 脸
  ctx.beginPath();
  ctx.ellipse(x, y + 10, 20, 18, 0, 0, Math.PI * 2);
  ctx.fillStyle = belly;
  ctx.fill();

  ctx.fillStyle = '#141414';
  ctx.beginPath();
  ctx.arc(x - 8, y - 2, 4.5, 0, Math.PI * 2);
  ctx.arc(x + 8, y - 2, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y + 4, 5, 0, Math.PI * 2);
  ctx.fill();

  // 金鼠四芒旋转闪烁
  if (gold && now > 0) {
    ctx.translate(x, y - 2);
    ctx.rotate(now / 400);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,244,180,0.85)';
    ctx.lineWidth = 2;
    const spike = 40 + Math.sin(now / 200) * 3;
    ctx.beginPath();
    ctx.moveTo(-spike, 0);
    ctx.lineTo(spike, 0);
    ctx.moveTo(0, -spike);
    ctx.lineTo(0, spike);
    ctx.stroke();
  }
  ctx.restore();
}

/** 准星：沿蛇形路径贴洞滑动，连击越高光环越亮。 */
function paintCrosshair(ctx: CanvasRenderingContext2D, cursorX: number, combo: number, now: number): void {
  const { x, y } = whackPathPoint((cursorX + 1) / 2);
  const glow = Math.min(combo, 10) * 1.5;
  ctx.save();
  if (now > 0) {
    const pulse = 1 + 0.05 * Math.sin(now / 180);
    ctx.strokeStyle = '#58c4ff';
    ctx.shadowColor = '#58c4ff';
    ctx.shadowBlur = 8 + glow;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, 17 * pulse, 0, Math.PI * 2);
    ctx.stroke();
  }
  const tick = 24;
  ctx.beginPath();
  ctx.moveTo(x - tick, y);
  ctx.lineTo(x - 8, y);
  ctx.moveTo(x + 8, y);
  ctx.lineTo(x + tick, y);
  ctx.moveTo(x, y - tick);
  ctx.lineTo(x, y - 8);
  ctx.moveTo(x, y + 8);
  ctx.lineTo(x, y + tick);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#e8f4ff';
  ctx.fill();
  ctx.restore();
}

/** 敲中爆发：外扩环 + 确定性散开的 10 粒火花；金鼠用更大的环。 */
function paintHitBurst(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, gold: boolean): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = gold ? '#ffe566' : '#8fd8ff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 8 + (gold ? 58 : 46) * t, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = gold ? '#ffd60a' : '#a8e2ff';
  const spread = 10 + 34 * t;
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2 + x * 0.017;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * spread, y + Math.sin(angle) * spread, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 缩回的红圈：这洞里的地鼠跑了。 */
function paintRetreatRing(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = '#ff5050';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y - 10, 10 + 20 * t, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** 敲空的红叉。 */
function paintWhiffX(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = '#ff5050';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  const s = 14 + 4 * t;
  ctx.beginPath();
  ctx.moveTo(x - s, y - s);
  ctx.lineTo(x + s, y + s);
  ctx.moveTo(x + s, y - s);
  ctx.lineTo(x - s, y + s);
  ctx.stroke();
  ctx.restore();
}

function paintPhaseText(ctx: CanvasRenderingContext2D, s: WhackGameState, now: number): void {
  ctx.textAlign = 'center';
  if (s.phase === 'ready') {
    ctx.fillStyle = '#c3cde4';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText('点头开始 · 转头找地鼠', GAME_WIDTH / 2, 90);
  } else if (s.phase === 'countdown') {
    const pulse = now > 0 ? 1 + 0.06 * Math.sin(now / 150) : 1;
    ctx.save();
    ctx.translate(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = '#ffd60a';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffd60a';
    ctx.font = '900 96px system-ui, sans-serif';
    ctx.fillText(String(Math.ceil(s.countdownMs / 1000)), 0, 0);
    ctx.restore();
  }
}
