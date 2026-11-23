import { useState } from 'react';
import { countExternalResources } from '../game/networkStats';
import { TEST_COUNT } from '../generated/testCount';
import { GAMES } from './gameMeta';
import Button from './Button';

interface StartScreenProps {
  /** 本机存过校准值：开始体验就直奔游戏，同时把「重新校准」摆出来 */
  hasCalibration: boolean;
  onStartCamera: () => void;
  onRecalibrate: () => void;
  onStartDemo: () => void;
  onOpenDevlog: () => void;
}

const FEATURES: readonly [string, string, string][] = [
  ['01', '不用手', '转头移动、点头确认，眨眼和张嘴当辅助键。'],
  ['02', '画面不上传', '人脸在你的浏览器里识别，请求不出本机。'],
  ['03', '三分钟一局', `30 秒校准，${GAMES.length} 个小游戏，随时能停。`],
  ['04', '为谁而做', '上肢障碍者、术后康复者、行动不便的长辈。'],
];

export default function StartScreen({
  hasCalibration,
  onStartCamera,
  onRecalibrate,
  onStartDemo,
  onOpenDevlog,
}: StartScreenProps) {
  // 对外请求在挂载这一刻实测：任何上传/埋点都会让这个数字变成非 0
  const [externalRequests] = useState(() =>
    countExternalResources(performance.getEntriesByType('resource'), location.origin),
  );

  return (
    <div className="relative flex min-h-[calc(100dvh-6rem)] flex-col overflow-hidden">
      <div aria-hidden="true" className="bg-arcade pointer-events-none absolute -inset-12 -z-10" />
      <FloatingCards />

      <div className="relative flex items-center justify-between text-xs font-semibold tracking-[0.35em] text-dim">
        <span>ZERO TOUCH ARCADE</span>
        <span className="text-accent/80">HACK4GOOD · 技术向善</span>
      </div>

      <div className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-5 py-10 text-center">
        <StarMark />
        <p className="text-xs font-semibold tracking-[0.5em] text-dim">A MOMENT BEFORE PLAY</p>
        <h1 className="font-display text-6xl leading-none tracking-[0.08em] sm:text-8xl">
          零触控游乐场
        </h1>
        <div aria-hidden="true" className="h-px w-28 bg-accent/50" />
        <p className="text-2xl text-dim sm:text-3xl">不用手，也能玩三分钟。</p>
        <p className="max-w-xl text-lg leading-relaxed text-dim">
          给上肢障碍者、术后康复者、行动不便的长辈：只用头、眼睛和嘴，就能玩一局游戏。
        </p>

        <div className="mt-3 flex w-full max-w-sm flex-col gap-3">
          <Button
            onClick={onStartCamera}
            hint={hasCalibration ? '上次已校准 · 直接进入' : '需要摄像头 · 约 30 秒校准'}
          >
            开始体验
          </Button>
          {hasCalibration ? (
            <Button variant="secondary" onClick={onRecalibrate} hint="换个坐姿、换个人，重新量一遍">
              重新校准
            </Button>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={onStartDemo} hint="不用摄像头">
              演示模式
            </Button>
            <Button variant="secondary" onClick={onOpenDevlog} hint="版本与踩坑记录">
              开发日志
            </Button>
          </div>
        </div>

        <p className="text-sm text-dim">
          {TEST_COUNT} 条测试 · {GAMES.length} 个游戏 · {externalRequests} 个对外请求 · 0 次上传
        </p>
      </div>

      <div className="relative grid gap-4 border-t border-edge/60 pt-5 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(([no, title, detail]) => (
          <div key={no} className="flex flex-col gap-1">
            <span className="text-xs font-black tracking-[0.25em] text-accent/70">{no}</span>
            <span className="text-lg font-bold">{title}</span>
            <span className="text-base leading-relaxed text-dim">{detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 四角星线框：加载页与首页共用的品牌符号。 */
export function StarMark({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="text-accent drop-shadow-[0_0_12px_rgba(255,214,10,0.35)]"
    >
      <path
        d="M32 3 C34.2 22 42 29.8 61 32 C42 34.2 34.2 42 32 61 C29.8 42 22 34.2 3 32 C22 29.8 29.8 22 32 3 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 首页两侧漂浮的游戏卡：装饰，不参与交互。 */
function FloatingCards() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden lg:block">
      <FloatCard className="left-[1%] top-[12%] -rotate-6" label="STAR CATCH">
        <span className="absolute left-[18%] top-[22%] h-2 w-2 rotate-45 bg-accent shadow-[0_0_8px_rgba(255,214,10,0.9)]" />
        <span className="absolute left-[62%] top-[38%] h-2 w-2 rotate-45 bg-accent shadow-[0_0_8px_rgba(255,214,10,0.9)]" />
        <span className="absolute right-[16%] top-[18%] h-2 w-2 rotate-45 bg-accent shadow-[0_0_8px_rgba(255,214,10,0.9)]" />
        <span className="absolute bottom-[16%] left-1/2 h-1.5 w-16 -translate-x-1/2 rounded-full bg-ring shadow-[0_0_14px_rgba(88,196,255,0.9)]" />
      </FloatCard>

      <FloatCard className="left-[3%] bottom-[16%] rotate-3" label="RHYTHM">
        <span className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/70" />
        <span className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ring/70" />
      </FloatCard>

      <FloatCard className="right-[2%] top-[14%] rotate-6" label="WHACK">
        <span className="absolute left-[22%] top-[26%] h-2 w-2 rounded-full bg-edge" />
        <span className="absolute left-[48%] top-[26%] h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_rgba(255,214,10,0.9)]" />
        <span className="absolute left-[74%] top-[26%] h-2 w-2 rounded-full bg-edge" />
        <span className="absolute left-[22%] top-[56%] h-2 w-2 rounded-full bg-edge" />
        <span className="absolute left-[48%] top-[56%] h-2 w-2 rounded-full bg-edge" />
        <span className="absolute left-[74%] top-[56%] h-2 w-2 rounded-full bg-edge" />
        <span className="absolute left-[48%] top-[56%] h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/60" />
      </FloatCard>

      <FloatCard className="right-[4%] bottom-[14%] -rotate-3" label="CANDLE">
        <span className="absolute bottom-[22%] left-[26%] h-6 w-2 rounded-sm bg-edge" />
        <span className="absolute bottom-[22%] left-[48%] h-6 w-2 rounded-sm bg-edge" />
        <span className="absolute bottom-[22%] left-[70%] h-6 w-2 rounded-sm bg-edge" />
        <span className="absolute bottom-[52%] left-[26%] h-2 w-2 rounded-full bg-accent shadow-[0_0_10px_rgba(255,214,10,0.9)]" />
        <span className="absolute bottom-[52%] left-[48%] h-2 w-2 rounded-full bg-accent shadow-[0_0_10px_rgba(255,214,10,0.9)]" />
        <span className="absolute bottom-[52%] left-[70%] h-2 w-2 rounded-full bg-edge" />
      </FloatCard>
    </div>
  );
}

function FloatCard({
  className,
  label,
  children,
}: {
  className: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`card-surface absolute w-40 overflow-hidden rounded-xl border border-edge/70 opacity-80 shadow-card ${className}`}
    >
      <div className="flex items-center justify-between border-b border-edge/50 px-2.5 py-1.5">
        <span className="text-[9px] font-bold tracking-[0.25em] text-dim">{label}</span>
        <span className="h-1 w-1 rounded-full bg-accent/80" />
      </div>
      <div className="relative h-24 bg-[#04060c]">{children}</div>
    </div>
  );
}
