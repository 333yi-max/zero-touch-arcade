import type { ReactNode } from 'react';

interface TopBarProps {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}

export default function TopBar({ title, onBack, right }: TopBarProps) {
  return (
    <header className="flex items-center gap-3 pb-5">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="min-h-16 shrink-0 rounded-card border-2 border-edge bg-card px-5 text-lg font-bold text-fg hover:border-accent"
        >
          ← 返回
        </button>
      ) : null}
      <h1 className="flex-1 text-2xl font-bold sm:text-3xl">{title}</h1>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}
