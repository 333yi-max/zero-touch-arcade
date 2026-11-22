interface OffsetBarProps {
  axis: 'yaw' | 'pitch';
  /** 相对中性位的带符号偏移 */
  offset: number;
  /** 参考线：走到边缘所需的幅度（= 钳位上限） */
  target: number;
  /** 只在采集窗口里给读数，引导阶段说「准备中」 */
  capturing: boolean;
}

/**
 * 实时偏移条。刻意不放进 aria-live：这个值每 33ms 变一次，念出来只会变成噪音。
 * 读屏用户听到的是每步一次的指令，视觉用户看这条。
 */
export default function OffsetBar({ axis, offset, target, capturing }: OffsetBarProps) {
  // 参考线放在中点偏外的位置，超过它还能往两边长，看得出「转过头了」
  const span = Math.max(1e-6, target * 1.5);
  const ratio = Math.max(-1, Math.min(1, offset / span));
  const half = 50;
  const tick = half / 1.5;
  const width = Math.abs(ratio) * half;
  const left = ratio >= 0 ? half : half - width;
  const reached = Math.abs(offset) >= target;

  const label =
    axis === 'yaw'
      ? `左右偏移 ${offset.toFixed(2)}，走到屏幕边缘大约需要 ${target.toFixed(2)}`
      : `点头幅度 ${offset.toFixed(2)}，触发确认大约需要 ${target.toFixed(2)}`;

  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={capturing ? label : `${label}（正在准备，先跟着提示做）`}
        className="relative h-5 w-full overflow-hidden rounded-full border-2 border-edge bg-page"
      >
        <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-edge" />
        <span
          aria-hidden="true"
          className="absolute inset-y-0 w-0.5 bg-dim/70"
          style={{ left: `${half - tick}%` }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-y-0 w-0.5 bg-dim/70"
          style={{ left: `${half + tick}%` }}
        />
        {capturing ? (
          <span
            aria-hidden="true"
            className={`absolute inset-y-1 rounded-full ${reached ? 'bg-accent' : 'bg-ring'}`}
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        ) : null}
      </div>
      <p className="text-base text-dim">
        {capturing
          ? reached
            ? '够了，保持这个幅度就行。'
            : axis === 'yaw'
              ? '再转一点：亮条盖过两边的细线，就表示能走到屏幕边缘。'
              : '再低一点：亮条盖过细线，点头幅度就够了。'
          : '准备中…'}
      </p>
    </div>
  );
}
