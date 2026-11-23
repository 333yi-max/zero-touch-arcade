import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** 按钮内第二行小字，用来说明代价，例如「需要摄像头」。 */
  hint?: ReactNode;
  /** 主行文字前的图标，一般传 lucide 组件。 */
  icon?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-linear-to-b from-accent-hi to-accent text-accent-fg shadow-glow hover:brightness-105 hover:-translate-y-0.5',
  secondary:
    'card-surface text-fg border-2 border-edge shadow-card hover:border-accent hover:bg-card-hi',
};

export default function Button({
  variant = 'primary',
  hint,
  icon,
  children,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`min-h-16 w-full rounded-card px-6 text-xl font-bold leading-tight inline-flex flex-col items-center justify-center gap-0.5 transition duration-200 ease-out-soft active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${className}`}
      {...rest}
    >
      <span className="inline-flex items-center gap-2">
        {icon ? <span aria-hidden="true" className="inline-flex shrink-0">{icon}</span> : null}
        {children}
      </span>
      {hint ? <span className="text-sm font-medium opacity-80">{hint}</span> : null}
    </button>
  );
}
