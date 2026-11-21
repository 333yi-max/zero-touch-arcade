import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** 按钮内第二行小字，用来说明代价，例如「需要摄像头」。 */
  hint?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110',
  secondary: 'bg-card text-fg border-2 border-edge hover:border-accent',
};

export default function Button({
  variant = 'primary',
  hint,
  children,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`min-h-16 w-full rounded-card px-6 text-xl font-bold leading-tight inline-flex flex-col items-center justify-center gap-0.5 transition duration-150 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${className}`}
      {...rest}
    >
      <span>{children}</span>
      {hint ? <span className="text-sm font-medium opacity-80">{hint}</span> : null}
    </button>
  );
}
