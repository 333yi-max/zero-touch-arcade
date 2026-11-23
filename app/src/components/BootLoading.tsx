import { StarMark } from './StarMark';

/** 启动页：约 0.9 秒的品牌过场，让首屏有仪式感，不做假进度条。 */
export default function BootLoading() {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 overflow-hidden bg-page">
      <div
        aria-hidden="true"
        className="bg-arcade pointer-events-none absolute -inset-16 -z-10 opacity-80"
      />
      <StarMark size={72} />
      <p className="text-[10px] font-semibold tracking-[0.5em] text-dim">A MOMENT BEFORE PLAY</p>
      <h1 className="font-display text-4xl leading-none tracking-[0.1em]">零触控游乐场</h1>
      <div aria-hidden="true" className="h-px w-20 bg-accent/40" />
      <p role="status" className="text-sm text-dim">
        正在点亮游乐场…
      </p>
    </div>
  );
}
