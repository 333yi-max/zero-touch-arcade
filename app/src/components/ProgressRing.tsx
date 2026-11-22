interface ProgressRingProps {
  /** 0~1 */
  value: number;
  /** 读屏和截图都要能说清这是第几步、在干什么 */
  label: string;
  icon: string;
  size?: number;
}

/**
 * 进度环。数字进度对读屏用户没意义，所以文字等价物放在 aria-valuetext 上；
 * 图标只是给明眼人的锚点，标成 aria-hidden 免得念两遍。
 */
export default function ProgressRing({ value, label, icon, size = 132 }: ProgressRingProps) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value));

  return (
    <span className="relative inline-flex shrink-0 items-center justify-center">
      <svg
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped * 100)}
        aria-valuetext={label}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-edge)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
        />
      </svg>
      <span aria-hidden="true" className="absolute text-5xl leading-none">
        {icon}
      </span>
    </span>
  );
}
