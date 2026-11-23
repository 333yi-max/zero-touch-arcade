import { useState } from 'react';
import { AlertTriangle, Activity, Bug, History } from 'lucide-react';
import { countExternalResources } from '../game/networkStats';
import { TEST_COUNT } from '../generated/testCount';
import TopBar from './TopBar';

interface DevlogScreenProps {
  onBack: () => void;
}

interface VersionEntry {
  hash: string;
  date: string;
  type: '新增' | '修复' | '调整';
  title: string;
  detail: string;
}

/** 全部取自 git log 真实提交（纯文档提交略去），日期为提交当天。 */
const VERSIONS: VersionEntry[] = [
  {
    hash: 'c0391c1',
    date: '11-22',
    type: '新增',
    title: '输入抽象 + 虚拟玩家',
    detail: '摄像头与演示两条输入管线同构，没有摄像头也能走完整个流程。',
  },
  {
    hash: '89bb1ab',
    date: '11-22',
    type: '新增',
    title: '接入真实摄像头（FaceLandmarker）',
    detail: 'wasm 与模型纳入仓库，人脸识别全部在本机浏览器里完成。',
  },
  {
    hash: '998d34c',
    date: '11-23',
    type: '新增',
    title: '校准页接真实采样',
    detail: '量程来自真人实测；点头改用独立的 pitchRange，不再和转头混用。',
  },
  {
    hash: '846573b',
    date: '11-23',
    type: '修复',
    title: '眨眼阈值下调到 0.38',
    detail: '按自然眨眼实测下调，故意眨眼与自然眨眼都能触发（见技术故事）。',
  },
  {
    hash: '51d3f5f',
    date: '11-24',
    type: '新增',
    title: '游戏 1 接星星',
    detail: '纯逻辑 + Canvas 渲染 + 合成音效；演示玩家会主动失误，不装满分。',
  },
  {
    hash: 'c95a654',
    date: '11-24',
    type: '新增',
    title: '选游戏页 + 游戏 2 节奏点头',
    detail: '游戏统一入口；结果卡与分享卡从第一天起就共用一套。',
  },
  {
    hash: '1a1ae8f',
    date: '11-24',
    type: '新增',
    title: '全站视觉精致化 + 游戏 3 霓虹贪吃蛇',
    detail: 'lucide 图标、设计 token 与克制动效；贪吃蛇用一维转头控制方向。',
  },
  {
    hash: 'c26cb55',
    date: '11-24',
    type: '新增',
    title: '游戏 4 打地鼠',
    detail: '3×3 网格 + 蛇形路径映射，转头行程对一维输入更友好。',
  },
  {
    hash: 'd07f98e',
    date: '11-24',
    type: '新增',
    title: '游戏 5 吹蜡烛',
    detail: '张嘴吹气累计约半秒吹灭一支，2 秒内连吹下一支有奖励。',
  },
  {
    hash: 'da87f9d',
    date: '11-24',
    type: '调整',
    title: 'HUD 与结果卡统一',
    detail: '抽出共享子件，五个游戏同构，数字全部 tabular-nums 对齐。',
  },
];

const TYPE_TONE: Record<VersionEntry['type'], string> = {
  新增: 'text-accent',
  修复: 'text-ring',
  调整: 'text-fg',
};

interface StoryEntry {
  title: string;
  rows: readonly [string, string][];
}

/** 三条技术故事：现象 / 根因 / 修法 / 验证，全部来自施工日志原文。 */
const STORIES: StoryEntry[] = [
  {
    title: '线上 wasm 404：多一个斜杠，本地没事、线上炸',
    rows: [
      ['现象', '本地 dev 和 preview 都正常，部署到线上后摄像头模式模型加载失败。'],
      [
        '根因',
        'FilesetResolver 用模板串自己补斜杠，传进去的 wasm/ 被拼成 wasm//vision_wasm_internal.js。Vite 开发服务器会归一化重复斜杠照常返回，静态托管则严格 404。',
      ],
      ['修法', '把参数从 asset("wasm/") 改成 asset("wasm")，一行。'],
      ['验证', '拦截 wasm 请求确认路径只有单斜杠；线上验收 4xx 归零。'],
    ],
  },
  {
    title: '演示入口按钮的 4 秒倒计时永远走不完',
    rows: [
      ['现象', '摄像头没识别到脸时，「先用演示模式」按钮应该几秒后出现，却一直不出来。'],
      [
        '根因',
        'useEffect 依赖了整个 frame 对象，而 useGesture 每 33ms 就产生一个新的 RawFrame——定时器每 33ms 被重置一次，倒计时永远走不完。',
      ],
      ['修法', '改成只依赖 frame?.present 这个布尔值。'],
      ['验证', '用假摄像头等 9 秒，按钮 isVisible() === true。'],
    ],
  },
  {
    title: '眨眼阈值 0.55 → 0.38：故意眨和自然眨不是一回事',
    rows: [
      ['现象', '真人验收时故意用力眨眼 3/3 全识别，自然眨眼 5 次只触发 1 次。'],
      [
        '根因',
        '实测用力眨眼 0.789/0.785，自然眨眼弱侧只有 0.683/0.471；判定用 min(左,右) > 阈值，弱侧一票否决，0.55 对自然眨眼太高。',
      ],
      ['修法', '阈值下调到 0.38（睁眼基线 0.15~0.25，留了余量），按住时长与冷却不动；点头为主、眨眼为辅的定位不变。'],
      ['验证', '70/70 条测试全绿。'],
    ],
  },
];

const LIMITS: string[] = [
  '真人样本 1 人：校准、转头、点头的真人验收目前只做了一轮，换人建议先重新校准。',
  '眨眼阈值 0.38 是单人实测的经验值（弱侧一票否决），换人可能需要再调。',
  '节奏点头、吹蜡烛还没做过真人验收；演示模式打过完整一局，真人链路记在待办里。',
  'Safari 只验证过私密模式写不进校准值的兜底，没做完整回归。',
  '模型首次加载约 13MB（3.7MB 模型 + 9.4MB wasm），弱网下第一次打开要多等一会儿。',
];

export default function DevlogScreen({ onBack }: DevlogScreenProps) {
  // 对外请求在挂载这一刻实测：任何上传/埋点都会让这个数字变成非 0
  const [externalRequests] = useState(() =>
    countExternalResources(performance.getEntriesByType('resource'), location.origin),
  );
  const stats: readonly [string, string][] = [
    [String(TEST_COUNT), '条自动化测试（实时）'],
    ['20 秒', '真人校准耗时（要求 30 秒内）'],
    ['3/3', '点头确认识别'],
    ['6/6', '转头 cursorX 到 ±1.000'],
    [String(externalRequests), '个对外请求（本页实测）'],
  ];

  return (
    <div className="flex flex-col gap-10">
      <TopBar title="开发日志" onBack={onBack} />

      <p className="max-w-prose text-lg leading-relaxed text-dim">
        这一页全部来自施工日志与 git 提交记录：做过哪些版本、踩过什么坑、验证过什么，还有哪些没验到。不藏问题，也不替没做过的事打保票。
      </p>

      <section aria-labelledby="devlog-versions" className="flex flex-col gap-4">
        <h2 id="devlog-versions" className="flex items-center gap-2 text-2xl font-bold">
          <History size={22} aria-hidden="true" className="shrink-0 text-accent" />
          版本记录
        </h2>
        <ol className="grid gap-3 lg:grid-cols-2">
          {VERSIONS.map((v) => (
            <li
              key={v.hash}
              className="card-surface flex flex-col gap-1.5 rounded-card border border-edge px-5 py-4 shadow-card"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className={`text-xs font-bold tracking-wider ${TYPE_TONE[v.type]}`}>
                  {v.type}
                </span>
                <span className="text-base font-bold">{v.title}</span>
                <span className="ml-auto font-mono text-sm text-dim">{v.hash}</span>
              </div>
              <p className="text-sm leading-relaxed text-dim">
                <span className="mr-2 font-mono">{v.date}</span>
                {v.detail}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="devlog-stories" className="flex flex-col gap-4">
        <h2 id="devlog-stories" className="flex items-center gap-2 text-2xl font-bold">
          <Bug size={22} aria-hidden="true" className="shrink-0 text-accent" />
          技术故事：三个真实的坑
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {STORIES.map((s) => (
            <article
              key={s.title}
              className="card-surface flex flex-col gap-3 rounded-card border border-edge p-5 shadow-card"
            >
              <h3 className="text-lg font-bold leading-snug">{s.title}</h3>
              {s.rows.map(([label, text]) => (
                <p key={label} className="text-base leading-relaxed text-dim">
                  <span className="mr-1.5 font-bold text-fg">{label}</span>
                  {text}
                </p>
              ))}
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="devlog-data" className="flex flex-col gap-4">
        <h2 id="devlog-data" className="flex items-center gap-2 text-2xl font-bold">
          <Activity size={22} aria-hidden="true" className="shrink-0 text-accent" />
          验过的数据
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
      </section>

      <section aria-labelledby="devlog-limits" className="flex flex-col gap-4">
        <h2 id="devlog-limits" className="flex items-center gap-2 text-2xl font-bold">
          <AlertTriangle size={22} aria-hidden="true" className="shrink-0 text-accent" />
          已知限制
        </h2>
        <ul className="card-surface flex flex-col gap-3 rounded-card border border-edge p-5 text-base shadow-card">
          {LIMITS.map((text) => (
            <li key={text} className="flex gap-2.5 leading-relaxed text-dim">
              <span aria-hidden="true" className="mt-1 shrink-0 text-ring">
                ▸
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
