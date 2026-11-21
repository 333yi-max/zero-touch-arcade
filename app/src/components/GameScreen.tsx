import { useEffect, useRef, useState } from 'react';
import { useGesture } from '../hooks/useGesture';
import { ScriptedSource } from '../input/scriptedSource';
import type { Mode } from '../state/machine';
import Button from './Button';
import TopBar from './TopBar';

interface GameScreenProps {
  mode: Mode;
  onBack: () => void;
  onFinish: (score: number) => void;
}

const CONFIRM_FLASH_MS = 180;
const BOX_SIZE = 96;
const TRACK_MARGIN = 32;

export default function GameScreen({ mode, onBack, onFinish }: GameScreenProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <TopBar
        title="游戏"
        onBack={onBack}
        right={
          <span className="rounded-full border-2 border-edge bg-card px-4 py-2 text-base font-bold text-dim">
            {mode === 'demo' ? '演示模式' : '摄像头'}
          </span>
        }
      />

      {mode === 'demo' ? (
        <p className="rounded-card bg-card px-5 py-3 text-lg text-dim">
          虚拟玩家演示，开启摄像头即可亲自体验。
        </p>
      ) : null}

      {mode === 'demo' ? <DemoBoard /> : <CameraPlaceholder />}

      <Button variant="secondary" onClick={() => onFinish(0)} hint="占位入口，用于走通流程">
        结束并查看结果
      </Button>
    </div>
  );
}

function DemoBoard() {
  const sourceRef = useRef<ScriptedSource | null>(null);
  if (sourceRef.current === null) sourceRef.current = new ScriptedSource();
  const { state, events } = useGesture(sourceRef.current);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef({ cursorX: 0, greenUntil: 0 });
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    sceneRef.current.cursorX = state.cursorX;
  }, [state.cursorX]);

  useEffect(() => {
    if (events.includes('confirm')) {
      sceneRef.current.greenUntil = performance.now() + CONFIRM_FLASH_MS;
    }
    if (events.includes('pause')) setPaused((p) => !p);
  }, [events]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    const draw = () => {
      const box = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(box.width * dpr));
      const height = Math.max(1, Math.round(box.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        paintDemo(ctx, box.width, box.height, sceneRef.current, performance.now());
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative h-[60vh] w-full sm:h-[68vh]">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="虚拟玩家正在用左右转头移动方块，点头或眨眼时方块会变绿"
        className="h-full w-full rounded-card border-2 border-edge bg-page"
      />
      {paused ? (
        <div
          role="status"
          className="absolute inset-0 flex items-center justify-center rounded-card bg-page/85"
        >
          <span className="text-4xl font-black">已暂停</span>
        </div>
      ) : null}
    </div>
  );
}

function paintDemo(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: { cursorX: number; greenUntil: number },
  now: number,
) {
  ctx.fillStyle = '#06080f';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#2a3550';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 12]);
  ctx.strokeRect(16, 16, width - 32, height - 32);
  ctx.setLineDash([]);

  const size = Math.min(BOX_SIZE, height - TRACK_MARGIN * 2, width - TRACK_MARGIN * 2);
  const left = TRACK_MARGIN;
  const right = width - TRACK_MARGIN - size;
  const ratio = (Math.max(-1, Math.min(1, scene.cursorX)) + 1) / 2;
  const x = left + ratio * (right - left);
  const y = (height - size) / 2;

  ctx.fillStyle = now < scene.greenUntil ? '#22c55e' : '#ffd60a';
  ctx.fillRect(x, y, size, size);
}

function CameraPlaceholder() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const box = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(box.width * dpr));
      canvas.height = Math.max(1, Math.round(box.height * dpr));

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);

      ctx.fillStyle = '#06080f';
      ctx.fillRect(0, 0, box.width, box.height);

      ctx.strokeStyle = '#2a3550';
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 12]);
      ctx.strokeRect(16, 16, box.width - 32, box.height - 32);
      ctx.setLineDash([]);

      ctx.fillStyle = '#c3cde4';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '600 22px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillText('摄像头画面占位 · 明天接入', box.width / 2, box.height / 2);
    };

    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="摄像头游戏画面占位，玩法将在下一阶段接入"
      className="h-[60vh] w-full rounded-card border-2 border-edge bg-page sm:h-[68vh]"
    />
  );
}
