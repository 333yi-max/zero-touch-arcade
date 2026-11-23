import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import {
  BEATS,
  beatAtMs,
  LEAD_MS,
  type JudgeResult,
  type RhythmGameState,
} from '../game/rhythmGame';

// ———— 画布几何（逻辑坐标，画布按 4:3 等比缩放）————

export const RHYTHM_WIDTH = 800;
export const RHYTHM_HEIGHT = 600;
const CX = RHYTHM_WIDTH / 2;
const CY = RHYTHM_HEIGHT / 2;
const TARGET_R = 70;
const RING_MAX = 280;

/** 声音的视觉替身：判定文字、拍点脉冲。时间戳由调用方在事件发生时打上。 */
export interface RhythmFx {
  judgeUntil: number;
  judge: { result: JudgeResult; beat: number } | null;
  beatUntil: number;
}

const EMPTY_FX: RhythmFx = { judgeUntil: 0, judge: null, beatUntil: 0 };

const JUDGE_LABELS: Record<JudgeResult, string> = {
  perfect: 'Perfect',
  good: 'Good',
  miss: 'Miss',
};

const JUDGE_COLORS: Record<JudgeResult, string> = {
  perfect: '#ffd60a',
  good: '#58c4ff',
  miss: '#ff5050',
};

interface RhythmGameProps {
  gameRef: RefObject<RhythmGameState>;
  fxRef: RefObject<RhythmFx>;
  /** 结束页等覆盖层，由调用方决定何时显示。 */
  overlay?: ReactNode;
  /** 摄像头模式下要和预览挤同一屏，画布得矮一点。 */
  frameClass?: string;
}

export default function RhythmGame({ gameRef, fxRef, overlay, frameClass }: RhythmGameProps) {
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
    <div className={`relative mx-auto aspect-[4/3] w-full ${frameClass ?? 'max-h-[60vh]'}`}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="节奏点头游戏画面：圆环缩小到中心圈重合的那一刻点头"
        className="absolute inset-0 h-full w-full rounded-card border-2 border-edge bg-page"
      />
      {overlay ?? null}
    </div>
  );
}

/** 容器比例和 800×600 不一致时（max-h 生效），逻辑画布居中，左右留边。 */
function paintGame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  s: RhythmGameState,
  fx: RhythmFx,
  now: number,
  reduced: boolean,
): void {
  const scale = Math.min(width / RHYTHM_WIDTH, height / RHYTHM_HEIGHT);
  const ox = (width - RHYTHM_WIDTH * scale) / 2;
  const oy = (height - RHYTHM_HEIGHT * scale) / 2;

  ctx.fillStyle = '#06080f';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  paintTarget(ctx);
  paintRings(ctx, s, reduced);
  if (!reduced && now < fx.beatUntil) paintBeatPulse(ctx, 1 - (fx.beatUntil - now) / 300);
  if (fx.judge && now < fx.judgeUntil) {
    paintJudgeText(ctx, fx.judge.result, reduced ? 0 : 1 - (fx.judgeUntil - now) / 500);
  }
  paintHudText(ctx, s);
  paintPhaseText(ctx, s);

  ctx.restore();
}

function paintTarget(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(88,196,255,0.06)';
  ctx.beginPath();
  ctx.arc(CX, CY, TARGET_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#58c4ff';
  ctx.lineWidth = 4;
  ctx.stroke();
}

/**
 * 收缩环：beatIndex 当前的环最亮，下一拍的环提前 200ms 淡入（LEAD 1200 > 拍距 1000）。
 * 早期判定让 beatIndex 跳走时，下一拍的环已按自己的时间表走到对应位置，不会瞬移。
 */
function paintRings(ctx: CanvasRenderingContext2D, s: RhythmGameState, reduced: boolean): void {
  if (s.phase !== 'playing' || s.beatIndex >= BEATS) return;
  const last = Math.min(BEATS - 1, s.beatIndex + 1);
  for (let i = s.beatIndex; i <= last; i += 1) {
    const start = beatAtMs(i) - LEAD_MS;
    const t = (s.elapsedMs - start) / LEAD_MS;
    if (t < 0) continue;
    const tt = Math.min(t, 1);
    const current = i === s.beatIndex;
    ctx.save();
    ctx.globalAlpha = current ? 0.35 + 0.5 * tt : 0.16;
    ctx.strokeStyle = current ? '#ffd60a' : '#3d4a6b';
    ctx.lineWidth = current ? 4 : 3;
    if (!reduced && current) {
      ctx.shadowColor = '#ffd60a';
      ctx.shadowBlur = 6 + 10 * tt;
    }
    ctx.beginPath();
    ctx.arc(CX, CY, RING_MAX - tt * (RING_MAX - TARGET_R), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/** 拍点的脉冲：目标圈外扩一圈淡出。 */
function paintBeatPulse(ctx: CanvasRenderingContext2D, t: number): void {
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = '#ffe566';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(CX, CY, TARGET_R + 46 * t, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function paintJudgeText(
  ctx: CanvasRenderingContext2D,
  result: JudgeResult,
  fade: number,
): void {
  ctx.save();
  if (fade > 0) {
    ctx.globalAlpha = Math.max(0, 1 - fade * fade);
    ctx.shadowColor = JUDGE_COLORS[result];
    ctx.shadowBlur = 18;
  }
  ctx.fillStyle = JUDGE_COLORS[result];
  ctx.font = '900 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(JUDGE_LABELS[result], CX, CY - TARGET_R - 34);
  ctx.restore();
}

function paintHudText(ctx: CanvasRenderingContext2D, s: RhythmGameState): void {
  ctx.textAlign = 'left';
  ctx.fillStyle = '#c3cde4';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillText(`拍子 ${s.results.length} / ${BEATS}`, 28, 46);

  ctx.textAlign = 'right';
  ctx.fillStyle = s.combo > 0 ? '#ffd60a' : '#5a6a8f';
  ctx.fillText(`连击 ${s.combo}`, RHYTHM_WIDTH - 28, 46);
}

function paintPhaseText(ctx: CanvasRenderingContext2D, s: RhythmGameState): void {
  ctx.textAlign = 'center';
  if (s.phase === 'ready') {
    ctx.fillStyle = '#c3cde4';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText('点头或眨眼开始', CX, CY - TARGET_R - 80);
  } else if (s.phase === 'countdown') {
    ctx.fillStyle = '#ffd60a';
    ctx.font = '900 96px system-ui, sans-serif';
    ctx.fillText(String(Math.ceil(s.countdownMs / 1000)), CX, CY);
  }
}
