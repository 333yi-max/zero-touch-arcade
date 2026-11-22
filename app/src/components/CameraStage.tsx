import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { FACE_POINTS } from '../input/faceFrame';
import type { CameraSource } from '../input/cameraSource';
import type { RawFrame } from '../input/types';
import Button from './Button';

interface CameraStageProps {
  videoRef: RefObject<HTMLVideoElement>;
  source: CameraSource | null;
  mirrored: boolean;
  overlay: boolean;
  paused: boolean;
  frame: RawFrame | null;
  onDemo: () => void;
}

/** 一直没等到人脸就别让人干等，4 秒后把演示模式的出口摆出来。 */
const NO_FACE_HINT_MS = 4000;

const KEY_POINTS = [
  FACE_POINTS.noseTip,
  FACE_POINTS.cheekLeft,
  FACE_POINTS.cheekRight,
  FACE_POINTS.eyeOuterLeft,
  FACE_POINTS.eyeOuterRight,
  FACE_POINTS.forehead,
  FACE_POINTS.chin,
];

/** 叠加层和预览用同一个 CSS 变换，关键点才能和画面重合。 */
const mirrorClass = (mirrored: boolean): string =>
  `absolute inset-0 h-full w-full object-cover${mirrored ? ' -scale-x-100' : ''}`;

export default function CameraStage({
  videoRef,
  source,
  mirrored,
  overlay,
  paused,
  frame,
  onDemo,
}: CameraStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showNoFaceHint, setShowNoFaceHint] = useState(false);

  useEffect(() => {
    if (frame?.present) {
      setShowNoFaceHint(false);
      return;
    }
    const timer = window.setTimeout(() => setShowNoFaceHint(true), NO_FACE_HINT_MS);
    return () => window.clearTimeout(timer);
  }, [frame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !overlay) return;

    let raf = 0;
    const draw = (): void => {
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
        ctx.clearRect(0, 0, box.width, box.height);
        paintLandmarks(ctx, box.width, box.height, source?.landmarks ?? null);
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [source, overlay]);

  const status = !frame
    ? '正在加载手势模型，第一次约 2 秒…'
    : !frame.present
      ? '没找到人脸，把脸对准取景框中间。'
      : `已捕捉人脸 · ${source?.delegate === 'CPU' ? 'CPU 回退' : 'GPU 委托已启用'}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-card border-2 border-edge bg-page">
        <video
          ref={videoRef}
          muted
          playsInline
          aria-hidden="true"
          className={mirrorClass(mirrored)}
        />
        {overlay ? (
          <canvas ref={canvasRef} aria-hidden="true" className={mirrorClass(mirrored)} />
        ) : null}

        <p
          role="status"
          aria-live="polite"
          className="absolute bottom-3 left-3 rounded-full bg-page/85 px-4 py-2 text-base font-semibold text-dim"
        >
          {status}
        </p>

        {paused ? (
          <div className="absolute inset-0 flex items-center justify-center bg-page/85">
            <span className="text-4xl font-black">已暂停</span>
          </div>
        ) : null}
      </div>

      {showNoFaceHint ? (
        <Button variant="secondary" onClick={onDemo} hint="画面里一直没出现人脸，可以先看玩法">
          先用演示模式
        </Button>
      ) : null}
    </div>
  );
}

function paintLandmarks(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  landmarks: readonly { x: number; y: number }[] | null,
): void {
  if (!landmarks) return;

  ctx.fillStyle = 'rgba(88, 196, 255, 0.75)';
  for (const point of landmarks) {
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const nose = landmarks[FACE_POINTS.noseTip];
  if (!nose) return;
  ctx.strokeStyle = '#ffd60a';
  ctx.lineWidth = 2;
  for (const index of KEY_POINTS) {
    const point = landmarks[index];
    if (!point) continue;
    ctx.beginPath();
    ctx.moveTo(nose.x * width, nose.y * height);
    ctx.lineTo(point.x * width, point.y * height);
    ctx.stroke();
    ctx.fillStyle = '#ffd60a';
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

interface CameraProblemCardProps {
  message: string;
  onDemo: () => void;
}

const CHECK_STEPS = [
  '点地址栏左侧的摄像头图标，把权限改回「允许」，刷新页面。',
  '关掉正在用摄像头的程序（微信/钉钉/腾讯会议/相机应用），再点重试。',
  '换 Chrome 或 Edge，并且用 https 地址或 localhost 打开——http 的非本机地址浏览器一律不给摄像头。',
];

export function CameraProblemCard({ message, onDemo }: CameraProblemCardProps) {
  return (
    <section
      aria-label="摄像头没打开"
      className="flex flex-col gap-4 rounded-card border-2 border-edge bg-card p-5"
    >
      <h2 className="text-2xl font-bold">摄像头没打开</h2>
      <p className="text-lg text-dim">{message}</p>

      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-bold">三步排查</h3>
        <ol className="flex list-decimal flex-col gap-1 pl-6 text-lg text-dim">
          {CHECK_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="secondary" onClick={onDemo} hint="不用摄像头，看虚拟玩家怎么玩">
          先用演示模式
        </Button>
      </div>
    </section>
  );
}
