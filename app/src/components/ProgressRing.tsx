import { useId } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  Handshake,
  MoveDown,
  RotateCcw,
  ScanFace,
  type LucideIcon,
} from 'lucide-react';

interface ProgressRingProps {
  /** 0~1 */
  value: number;
  /** 读屏和截图都要能说清这是第几步、在干什么 */
  label: string;
  /** STEP_COPY 里的图标名（见 calibration/steps.ts） */
  icon: string;
  size?: number;
}

/** 步骤文案里的图标名 → lucide 组件；遇到不认识的兜底成眼睛。 */
const STEP_ICONS: Record<string, LucideIcon> = {
  eye: Eye,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  'move-down': MoveDown,
  'scan-face': ScanFace,
  'rotate-ccw': RotateCcw,
  handshake: Handshake,
};

/**
 * 进度环。数字进度对读屏用户没意义，所以文字等价物放在 aria-valuetext 上；
 * 图标只是给明眼人的锚点，标成 aria-hidden 免得念两遍。
 */
export default function ProgressRing({ value, label, icon, size = 132 }: ProgressRingProps) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value));
  const gradientId = useId();
  const Icon = STEP_ICONS[icon] ?? Eye;

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
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" />
            <stop offset="100%" stopColor="var(--color-ring)" />
          </linearGradient>
        </defs>
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
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          className="drop-shadow-[0_0_6px_rgba(255,214,10,0.45)]"
        />
      </svg>
      <Icon
        aria-hidden="true"
        size={size * 0.32}
        strokeWidth={1.5}
        className="absolute text-accent"
      />
    </span>
  );
}
