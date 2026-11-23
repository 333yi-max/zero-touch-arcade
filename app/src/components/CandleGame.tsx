import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import {
  BLOW_MS,
  CANDLE_COUNT,
  GAME_HEIGHT,
  GAME_WIDTH,
  type CandleGameState,
} from '../game/candleGame';
import { paintBackdrop } from '../game/backdrop';
import { paintFloatTexts, type FloatText } from '../game/fx';

/** 声音的视觉替身：吹灭烟圈、飘字与震屏。 */
export interface CandleFx {
  extinguishUntil: number;
  extinguishAt: { x: number; y: number } | null;
  extinguishBonus: boolean;
  shakeUntil: number;
  shakePower: number;
  texts: FloatText[];
}

const EMPTY_FX: CandleFx = {
  extinguishUntil: 0,
  extinguishAt: null,
  extinguishBonus: false,
  shakeUntil: 0,
  shakePower: 0,
  texts: [],
};

/** 5 支蜡烛横排居中：x 间隔 130，底座 y 470。 */
const CANDLE_X = [205, 335, 465, 595, 725];
const BASE_Y = 470;
const BODY_H = 150;
const WICK_TOP = BASE_Y - BODY_H - 26;

/** 第 i 支蜡烛火焰中心（会话层给吹灭特效定位用）。 */
export function candleFlamePos(index: number): { x: number; y: number } {
  return { x: CANDLE_X[index], y: WICK_TOP - 24 };
}

interface CandleGameProps {
  gameRef: RefObject<CandleGameState>;
  fxRef: RefObject<CandleFx>;
  /** 结束页等覆盖层，由调用方决定何时显示。 */
  overlay?: ReactNode;
  /** 摄像头模式下要和预览挤同一屏，画布得矮一点。 */
  frameClass?: string;
}

export default function CandleGame({ gameRef, fxRef, overlay, frameClass }: CandleGameProps) {
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
        aria-label="吹蜡烛游戏画面：张嘴吹气，吹灭面前的五支蜡烛"
        className="absolute inset-0 h-full w-full rounded-card border-2 border-edge bg-page ring-1 ring-white/5"
      />
      {overlay ?? null}
    </div>
  );
}

function paintGame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  s: CandleGameState,
  fx: CandleFx,
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
      Math.sin(now * 0.11) * 8 * fx.shakePower * t,
      Math.cos(now * 0.09) * 6 * fx.shakePower * t,
    );
  }

  ctx.strokeStyle = '#2a3550';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 12]);
  ctx.strokeRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  ctx.setLineDash([]);

  const current = s.candles.findIndex((lit) => lit);
  for (let i = 0; i < CANDLE_COUNT; i += 1) {
    paintCandle(
      ctx,
      CANDLE_X[i],
      s.candles[i],
      i === current && s.phase === 'playing',
      s.blowMs / BLOW_MS,
      reduced ? 0 : now,
    );
  }

  if (!reduced && now < fx.extinguishUntil && fx.extinguishAt) {
    paintExtinguishPuff(ctx, fx.extinguishAt.x, fx.extinguishAt.y, 1 - (fx.extinguishUntil - now) / 700);
  }

  paintFloatTexts(ctx, fx.texts, now);
  paintPhaseText(ctx, s, reduced ? 0 : now);

  ctx.restore();
}

/** 一支蜡烛：柱身 + 烛芯 + 火焰；当前目标是进度环，灭了的画烟圈。 */
function paintCandle(
  ctx: CanvasRenderingContext2D,
  x: number,
  lit: boolean,
  isCurrent: boolean,
  progress: number,
  now: number,
): void {
  ctx.save();

  // 柱身
  const body = ctx.createLinearGradient(x - 16, 0, x + 16, 0);
  body.addColorStop(0, '#3b4259');
  body.addColorStop(0.5, '#5a6482');
  body.addColorStop(1, '#3b4259');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(x - 16, BASE_Y - BODY_H, 32, BODY_H, 8);
  ctx.fill();

  // 桌面阴影
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(x, BASE_Y + 6, 30, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // 烛芯
  ctx.strokeStyle = '#20242f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, WICK_TOP + 26);
  ctx.lineTo(x, WICK_TOP + 6);
  ctx.stroke();

  if (lit) {
    // 光晕
    if (now > 0) {
      const glow = ctx.createRadialGradient(x, WICK_TOP, 2, x, WICK_TOP, 90);
      glow.addColorStop(0, 'rgba(255,214,10,0.4)');
      glow.addColorStop(1, 'rgba(255,214,10,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 90, WICK_TOP - 90, 180, 180);
    }

    // 火焰：外层 + 内焰，随 now 摆动
    const sway = now > 0 ? Math.sin(now / 160 + x) * 5 : 0;
    const breathe = now > 0 ? 1 + 0.08 * Math.sin(now / 90 + x * 0.7) : 1;
    const flameH = 52 * breathe;
    ctx.fillStyle = '#ff9d2e';
    ctx.beginPath();
    ctx.ellipse(x + sway * 0.4, WICK_TOP - flameH / 2, 13, flameH / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe566';
    ctx.beginPath();
    ctx.ellipse(x + sway * 0.8, WICK_TOP - flameH / 4, 6.5, flameH / 3.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // 当前目标：进度环 + 吹气风线
    if (isCurrent && now > 0) {
      ctx.strokeStyle = 'rgba(88,196,255,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, WICK_TOP - flameH / 2, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.stroke();
      ctx.setLineDash([4, 8]);
      ctx.strokeStyle = 'rgba(88,196,255,0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, WICK_TOP - flameH / 2, 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 风线：从右侧吹向火焰
      if (progress > 0 && progress < 1) {
        ctx.strokeStyle = `rgba(160,226,255,${0.5 * Math.min(1, progress * 2)})`;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        const puff = 1 + 0.3 * Math.sin(now / 60);
        for (const dy of [-14, 0, 14]) {
          ctx.beginPath();
          ctx.moveTo(x + 120, WICK_TOP + dy - 20);
          ctx.lineTo(x + 40 * puff, WICK_TOP + dy - 20);
          ctx.stroke();
        }
      }
    }
  } else if (now > 0) {
    // 熄灭的烟圈：芯头一缕青烟
    ctx.strokeStyle = 'rgba(160,170,200,0.5)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const drift = Math.sin(now / 500 + x) * 4;
    ctx.moveTo(x, WICK_TOP + 4);
    ctx.quadraticCurveTo(x + drift, WICK_TOP - 20, x + drift * 2, WICK_TOP - 46);
    ctx.stroke();
  }

  ctx.restore();
}

/** 吹灭瞬间：烟圈上飘扩散。 */
function paintExtinguishPuff(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = '#a8b8d8';
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i += 1) {
    const r = 10 + 34 * t + i * 9;
    ctx.beginPath();
    ctx.arc(x + (i - 1) * 8, y - 40 * t - i * 12, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function paintPhaseText(ctx: CanvasRenderingContext2D, s: CandleGameState, now: number): void {
  ctx.textAlign = 'center';
  if (s.phase === 'ready') {
    ctx.fillStyle = '#c3cde4';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText('点头开始 · 张嘴吹蜡烛', GAME_WIDTH / 2, 120);
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
