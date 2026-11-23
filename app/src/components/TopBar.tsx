import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

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
          className="min-h-16 shrink-0 rounded-card border-2 border-edge bg-card px-5 text-lg font-bold text-fg transition duration-200 ease-out-soft hover:border-accent"
        >
          <span className="inline-flex items-center gap-2">
            <ArrowLeft size={22} aria-hidden="true" />
            返回
          </span>
        </button>
      ) : null}
      <h1 className="flex-1 text-2xl font-bold sm:text-3xl">{title}</h1>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}
