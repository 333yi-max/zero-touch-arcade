import type { ReactNode } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

/**
 * 五个游戏共用的 HUD 子件：统一外壳、小标签 + tabular 数字、音效/暂停按钮。
 * 窄屏横排换行，xl 起竖排、行间细分隔线。
 */

export function HudContainer({ children }: { children: ReactNode }) {
  return (
    <div className="card-surface flex flex-wrap items-center gap-x-5 gap-y-3 rounded-card border-2 border-edge px-5 py-3 shadow-card xl:flex-col xl:items-stretch xl:gap-0 xl:divide-y xl:divide-edge/40 xl:py-2">
      {children}
    </div>
  );
}

/** 一行 HUD：小标签在上，数值在下。 */
export function HudField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 xl:py-2.5">
      <span className="text-xs font-bold tracking-wider text-dim">{label}</span>
      {children}
    </div>
  );
}

/** 分数行：全 HUD 共用的「得分」样式。 */
export function HudScore({ score }: { score: number }) {
  return (
    <HudField label="得分">
      <p className="text-2xl font-black tabular-nums" aria-live="polite" aria-label={`得分 ${score}`}>
        {score}
      </p>
    </HudField>
  );
}

/** 普通统计行（敲中 x/25、时间 m:ss……）。 */
export function HudStat({
  label,
  value,
  live = false,
}: {
  label: string;
  value: string;
  live?: boolean;
}) {
  return (
    <HudField label={label}>
      <p className="text-lg font-bold tabular-nums" aria-live={live ? 'polite' : undefined}>
        {value}
      </p>
    </HudField>
  );
}

/** 连击/倍率/闪耀等徽章行；没内容时整个不渲染（调用方判断）。 */
export function HudBadge({
  children,
  tone = 'accent',
  live = false,
}: {
  children: ReactNode;
  tone?: 'accent' | 'accent-hi';
  live?: boolean;
}) {
  return (
    <div className="xl:py-2.5">
      <span
        aria-live={live ? 'polite' : undefined}
        className={`rounded-full px-3 py-1 text-base font-black text-accent-fg ${
          tone === 'accent-hi' ? 'bg-accent-hi' : 'bg-accent'
        }`}
      >
        {children}
      </span>
    </div>
  );
}

/** 生命值圆点行（接星星）。 */
export function HudLives({ lives, total }: { lives: number; total: number }) {
  return (
    <HudField label="生命">
      <p
        role="img"
        aria-label={`剩 ${lives} 条，共 ${total} 条`}
        className="flex items-center gap-1.5"
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full ${i < lives ? 'bg-accent' : 'bg-edge'}`}
          />
        ))}
      </p>
    </HudField>
  );
}

/** 倒计时的屏幕阅读器播报（画布里的数字本身不可读）。 */
export function CountdownAnnouncer({ active, remaining }: { active: boolean; remaining: number }) {
  return (
    <span className="sr-only" aria-live="polite">
      {active ? `倒计时 ${remaining}` : ''}
    </span>
  );
}

/** 音效 + 可选暂停按钮：全 HUD 对齐、样式一致；candle/rhythm 不传暂停就不渲染。 */
export function HudActions({
  muted,
  onMuteToggle,
  paused = false,
  onPauseToggle,
}: {
  muted: boolean;
  onMuteToggle: () => void;
  paused?: boolean;
  onPauseToggle?: () => void;
}) {
  return (
    <div className="ml-auto flex gap-3 xl:ml-0 xl:py-2.5">
      <MuteButton muted={muted} onToggle={onMuteToggle} />
      {onPauseToggle ? <PauseButton paused={paused} onToggle={onPauseToggle} /> : null}
    </div>
  );
}

export function MuteButton({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={muted}
      className="min-h-16 rounded-card border-2 border-edge bg-page px-5 text-lg font-bold text-fg transition duration-200 ease-out-soft hover:border-accent"
    >
      <span className="inline-flex items-center gap-2">
        {muted ? (
          <VolumeX size={20} aria-hidden="true" />
        ) : (
          <Volume2 size={20} aria-hidden="true" />
        )}
        音效：{muted ? '关' : '开'}
      </span>
    </button>
  );
}

export function PauseButton({ paused, onToggle }: { paused: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={paused ? '继续游戏' : '暂停游戏'}
      className="min-h-16 rounded-card border-2 border-edge bg-page px-5 text-lg font-bold text-fg transition duration-200 ease-out-soft hover:border-accent"
    >
      {paused ? '继续' : '暂停'}
    </button>
  );
}
