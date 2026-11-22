import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useDebugTrace } from '../hooks/useDebugTrace';
import { useGesture } from '../hooks/useGesture';
import { CameraSource } from '../input/cameraSource';
import type { GestureEvent } from '../input/types';
import { ScriptedSource } from '../input/scriptedSource';
import type { Mode } from '../state/machine';
import Button from './Button';
import CameraStage, { CameraProblemCard } from './CameraStage';
import DebugPanel from './DebugPanel';
import TopBar from './TopBar';

interface GameScreenProps {
  mode: Mode;
  onBack: () => void;
  onFinish: (score: number) => void;
  onDemo: () => void;
}

const CONFIRM_FLASH_MS = 180;
const BOX_SIZE = 96;
const TRACK_MARGIN = 32;
const EVENT_LOG_SIZE = 8;

interface DemoScene {
  cursorX: number;
  greenUntil: number;
}

export default function GameScreen({ mode, onBack, onFinish, onDemo }: GameScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scriptedRef = useRef<ScriptedSource | null>(null);
  const sceneRef = useRef<DemoScene>({ cursorX: 0, greenUntil: 0 });

  const [cameraSource, setCameraSource] = useState<CameraSource | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [mirrorX, setMirrorX] = useState<1 | -1>(-1);
  const [overlay, setOverlay] = useState(true);
  const [debugOpen, setDebugOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [eventLog, setEventLog] = useState<{ type: GestureEvent; at: number }[]>([]);

  useEffect(() => {
    if (mode !== 'camera') return;
    const video = videoRef.current;
    if (!video) return;
    const source = new CameraSource(video, (error) => setResumeError(error.message));
    setCameraSource(source);
    return () => {
      setCameraSource(null);
      source.dispose();
    };
  }, [mode]);

  if (mode === 'demo' && scriptedRef.current === null) {
    scriptedRef.current = new ScriptedSource();
  }

  const { state, events, frame, error } = useGesture(
    mode === 'demo' ? scriptedRef.current : cameraSource,
    mirrorX,
  );

  useEffect(() => {
    sceneRef.current.cursorX = state.cursorX;
  }, [state.cursorX]);

  useEffect(() => {
    if (events.length === 0) return;
    if (events.includes('confirm')) {
      sceneRef.current.greenUntil = performance.now() + CONFIRM_FLASH_MS;
    }
    if (events.includes('pause')) setPaused((p) => !p);
    setEventLog((log) =>
      [...events.map((type) => ({ type, at: Date.now() })), ...log].slice(0, EVENT_LOG_SIZE),
    );
  }, [events]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.toLowerCase() !== 'd') return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      event.preventDefault();
      setDebugOpen((open) => !open);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const problem = error ?? resumeError;
  const trace = useDebugTrace(frame, state.cursorX, events);

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

      {mode === 'camera' && problem ? (
        <CameraProblemCard message={problem} onDemo={onDemo} />
      ) : null}

      {mode === 'demo' ? (
        <DemoCanvas sceneRef={sceneRef} paused={paused} />
      ) : (
        <CameraStage
          videoRef={videoRef}
          source={cameraSource}
          mirrored={mirrorX === -1}
          overlay={overlay}
          paused={paused}
          frame={frame}
          onDemo={onDemo}
        />
      )}

      <p className="text-base text-dim">
        按 D 打开调试面板
        {paused ? ' · 已暂停，张嘴放开后再按一次' : ''}
      </p>

      <Button variant="secondary" onClick={() => onFinish(0)} hint="占位入口，用于走通流程">
        结束并查看结果
      </Button>

      {debugOpen ? (
        <DebugPanel
          frame={frame}
          state={state}
          eventLog={eventLog}
          mirrorX={mirrorX}
          onMirrorXChange={setMirrorX}
          overlay={overlay}
          onOverlayChange={setOverlay}
          delegate={cameraSource?.delegate ?? null}
          peaks={trace.peaks}
          rows={trace.rows}
          onResetPeaks={trace.resetPeaks}
          onExportCsv={trace.exportCsv}
          onClose={() => setDebugOpen(false)}
        />
      ) : null}
    </div>
  );
}

interface DemoCanvasProps {
  sceneRef: RefObject<DemoScene>;
  paused: boolean;
}

function DemoCanvas({ sceneRef, paused }: DemoCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    const draw = () => {
      const scene = sceneRef.current;
      const box = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(box.width * dpr));
      const height = Math.max(1, Math.round(box.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const ctx = canvas.getContext('2d');
      if (ctx && scene) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        paintDemo(ctx, box.width, box.height, scene, performance.now());
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [sceneRef]);

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
  scene: DemoScene,
  now: number,
): void {
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
