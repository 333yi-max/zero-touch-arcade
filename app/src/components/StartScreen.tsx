import { useState } from 'react';
import {
  BadgeCheck,
  Hand,
  HeartHandshake,
  HelpCircle,
  Lock,
  Monitor,
  PlayCircle,
  ScrollText,
  ShieldCheck,
  Timer,
  Zap,
  type LucideIcon,
} from 'lucide-react';
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

const FEATURES: readonly [string, string, string, string][] = [
  ['01', '不用手', '转头移动、点头确认，眨眼和张嘴当辅助键。', 'zap'],
  ['02', '画面不上传', '人脸在你的浏览器里识别，请求不出本机。', 'shield-check'],
  ['03', '三分钟一局', `30 秒校准，${GAMES.length} 个小游戏，随时能停。`, 'timer'],
];

const FEATURE_ICONS: Record<string, LucideIcon> = {
  zap: Zap,
  'shield-check': ShieldCheck,
  timer: Timer,
};

const NOTICE_ITEMS: { icon: LucideIcon; text: string }[] = [
  { icon: Lock, text: '视频只在你的浏览器里处理，不会上传到任何服务器。' },
  { icon: Monitor, text: '建议使用 Chrome 或 Edge，并在弹出提示时允许使用摄像头。' },
  { icon: Hand, text: '没有摄像头也没关系，选「演示模式」即可看完整个玩法。' },
];

export default function StartScreen({
  hasCalibration,
  onStartCamera,
  onRecalibrate,
  onStartDemo,
  onOpenDevlog,
}: StartScreenProps) {
  const [notice, setNotice] = useState('');
  // 对外请求在挂载这一刻实测：任何上传/埋点都会让这个数字变成非 0
  const [externalRequests] = useState(() =>
    countExternalResources(performance.getEntriesByType('resource'), location.origin),
  );
  const stats: readonly [string, string][] = [
    [String(TEST_COUNT), '条自动化测试'],
    [String(GAMES.length), '个小游戏'],
    [String(externalRequests), '个对外请求'],
    ['0', '次画面上传'],
  ];

  return (
    <div className="relative flex flex-col gap-10">
      <div
        aria-hidden="true"
        className="bg-arcade pointer-events-none absolute -inset-x-5 -top-8 -bottom-10 -z-10"
      />

      <div className="grid gap-10 lg:grid-cols-5 lg:items-start">
        <div className="flex flex-col gap-10 lg:col-span-3">
      <header className="animate-fade-in-up flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold tracking-[0.3em] text-accent">
            HACK4GOOD · 技术向善
          </p>
          <span aria-hidden="true" className="h-0.5 w-14 bg-accent/40" />
        </div>
        <h1 className="font-display text-5xl leading-[1.08] tracking-[0.06em] sm:text-7xl">
          零触控游乐场
        </h1>
        <p className="text-xs font-semibold tracking-[0.5em] text-dim">
          ZERO TOUCH ARCADE
        </p>
        <p className="mt-1 text-2xl text-dim sm:text-3xl">不用手，也能玩三分钟。</p>
        <p className="max-w-prose text-lg text-dim">
          给上肢障碍者、术后康复者、行动不便的长辈：只用头、眼睛和嘴，就能玩一局游戏。
        </p>
      </header>

      <div className="animate-fade-in-up stagger-2 grid gap-3 sm:grid-cols-3">
        {FEATURES.map(([no, title, detail, icon]) => {
          const Icon = FEATURE_ICONS[icon] ?? Zap;
          return (
            <div
              key={no}
              className="card-surface flex flex-col gap-1.5 rounded-card border border-edge p-5 shadow-card transition duration-200 ease-out-soft hover:border-accent/50 hover:bg-card-hi"
            >
              <div className="flex items-center justify-between">
                <Icon size={24} strokeWidth={1.75} aria-hidden="true" className="text-accent" />
                <span className="text-lg font-black tracking-[0.2em] text-accent/70">{no}</span>
              </div>
              <span className="text-xl font-bold">{title}</span>
              <span className="text-base leading-relaxed text-dim">{detail}</span>
            </div>
          );
        })}
      </div>

      <section
        aria-label="评委三十秒速览"
        className="animate-fade-in-up stagger-3 card-surface flex flex-col gap-4 rounded-card border border-edge p-5 shadow-card"
      >
        <h2 className="text-xl font-bold">评委 30 秒</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <JudgeItem
            icon={HelpCircle}
            title="这是什么"
            text="纯前端的体感游戏合集：摄像头识别头、眼、嘴的动作，代替手来操作。"
          />
          <JudgeItem
            icon={HeartHandshake}
            title="给谁用"
            text="上肢障碍者、术后康复者、行动不便的长辈，以及想换种方式玩游戏的人。"
          />
          <div className="flex flex-col gap-1.5">
            <p className="flex items-center gap-2 text-base font-bold">
              <PlayCircle size={18} aria-hidden="true" className="shrink-0 text-accent" />
              怎么玩
            </p>
            <p className="text-base leading-relaxed text-dim">
              不用摄像头、不用等待，虚拟玩家直接打一局给你看。
            </p>
            <button
              type="button"
              onClick={onStartDemo}
              className="mt-1 inline-flex w-fit items-center gap-2 self-start rounded-full border-2 border-accent/60 bg-accent/10 px-4 py-1.5 text-base font-bold text-accent transition duration-200 ease-out-soft hover:bg-accent/20"
            >
              <PlayCircle size={16} aria-hidden="true" />
              演示模式
            </button>
          </div>
          <JudgeItem
            icon={BadgeCheck}
            title="证据"
            text={`${TEST_COUNT} 条自动化测试 · ${GAMES.length} 个游戏 · 0 对外请求 · 0 次上传。`}
          />
        </div>
      </section>

      <div className="animate-fade-in-up stagger-4 flex flex-col gap-4">
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
        <Button variant="secondary" onClick={onStartDemo} hint="不用摄像头，看虚拟玩家怎么玩">
          演示模式
        </Button>
        <Button
          variant="secondary"
          onClick={() => setNotice('60 秒介绍视频还在制作中，上线后这里可以直接播放。')}
          hint="约 60 秒"
        >
          看 60 秒视频
        </Button>
        <Button
          variant="secondary"
          onClick={onOpenDevlog}
          icon={<ScrollText size={20} />}
          hint="版本记录、踩过的坑与已知限制"
        >
          开发日志
        </Button>
      </div>

      <p role="status" aria-live="polite" className="min-h-6 text-lg font-semibold text-accent">
        {notice}
      </p>
        </div>

        <aside className="flex flex-col gap-4 lg:col-span-2 lg:sticky lg:top-8">
          <PreviewCard />
          <div className="grid grid-cols-2 gap-3">
            {stats.map(([value, label]) => (
              <div
                key={label}
                className="card-surface rounded-card border border-edge px-2 py-4 text-center shadow-card"
              >
                <p className="text-2xl font-black tabular-nums text-accent">{value}</p>
                <p className="mt-1 text-sm leading-tight text-dim">{label}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <section
        aria-label="使用前请知道"
        className="card-surface flex flex-col gap-3 rounded-card border border-edge p-5 text-lg shadow-card"
      >
        <h2 className="text-xl font-bold">使用前请知道</h2>
        {NOTICE_ITEMS.map(({ icon: Icon, text }) => (
          <p key={text} className="flex gap-2.5 text-dim">
            <Icon size={20} aria-hidden="true" className="mt-1 shrink-0 text-ring" />
            <span>{text}</span>
          </p>
        ))}
      </section>
    </div>
  );
}

function JudgeItem({
  icon: Icon,
  title,
  text,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-2 text-base font-bold">
        <Icon size={18} aria-hidden="true" className="shrink-0 text-accent" />
        {title}
      </p>
      <p className="text-base leading-relaxed text-dim">{text}</p>
    </div>
  );
}

/** 首页右侧的静态玩法示意：不加载摄像头也能一眼看懂怎么玩。 */
function PreviewCard() {
  /** [left%, 静态 top%, 时长 s, 延迟 s]；静态位置是 reduced-motion 下的兜底。 */
  const stars: readonly [number, number, number, number][] = [
    [20, 22, 5.2, -1.2],
    [56, 16, 6.4, -3.4],
    [76, 40, 4.6, -2.1],
    [36, 54, 5.8, -4.4],
    [86, 66, 6.8, -0.6],
    [12, 72, 5.4, -2.8],
  ];
  return (
    <figure className="card-surface overflow-hidden rounded-card border border-edge shadow-card">
      <div className="flex items-center justify-between border-b border-edge/60 px-4 py-3">
        <span className="text-xs font-bold tracking-[0.3em] text-dim">STAR CATCH / LIVE</span>
        <span className="flex items-center gap-1.5 text-xs font-bold text-ring">
          <span className="h-2 w-2 animate-pulse rounded-full bg-ring" />
          本地识别
        </span>
      </div>
      <div className="relative aspect-[4/3] w-full bg-[#04060c]">
        <div aria-hidden="true" className="bg-arcade pointer-events-none absolute inset-0 opacity-60" />
        {stars.map(([left, top, dur, delay]) => (
          <span
            key={`${left}-${top}`}
            aria-hidden="true"
            className="animate-fall-star absolute h-2.5 w-2.5 rotate-45 bg-accent shadow-[0_0_10px_rgba(255,214,10,0.8)]"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              animationDuration: `${dur}s`,
              animationDelay: `${delay}s`,
            }}
          />
        ))}
        <div
          aria-hidden="true"
          className="absolute bottom-[12%] left-[62%] h-3 w-28 -translate-x-1/2 rounded-full bg-ring shadow-[0_0_24px_rgba(88,196,255,0.9)]"
        />
        <span className="absolute bottom-3 left-4 rounded-full bg-page/80 px-3 py-1 text-xs font-semibold text-dim">
          转头移动挡板 · 点头确认
        </span>
      </div>
    </figure>
  );
}
