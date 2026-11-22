import type { GestureConfig } from '../input/config';
import type { GestureEvent, InputState, RawFrame } from '../input/types';

interface DebugPanelProps {
  frame: RawFrame | null;
  state: InputState;
  eventLog: { type: GestureEvent; at: number }[];
  mirrorX: GestureConfig['mirrorX'];
  onMirrorXChange: (value: GestureConfig['mirrorX']) => void;
  overlay: boolean;
  onOverlayChange: (value: boolean) => void;
  delegate: 'GPU' | 'CPU' | null;
  onClose: () => void;
}

const num = (value: number): string => value.toFixed(3);

function clock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function Toggle({
  label,
  pressed,
  on,
  off,
  onChange,
}: {
  label: string;
  pressed: boolean;
  on: string;
  off: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onChange}
      className="flex items-center justify-between gap-3 rounded-lg border-2 border-edge bg-page px-3 py-2 text-left text-base"
    >
      <span>{label}</span>
      <span className="font-mono font-bold text-accent">{pressed ? on : off}</span>
    </button>
  );
}

export default function DebugPanel({
  frame,
  state,
  eventLog,
  mirrorX,
  onMirrorXChange,
  overlay,
  onOverlayChange,
  delegate,
  onClose,
}: DebugPanelProps) {
  return (
    <section
      aria-label="调试面板"
      className="fixed right-4 top-4 z-50 flex w-72 flex-col gap-3 rounded-card border-2 border-edge bg-card p-4 text-base shadow-lg"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">调试面板</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border-2 border-edge px-3 py-1 text-base"
        >
          关闭（D）
        </button>
      </div>

      <Toggle
        label="镜像预览"
        pressed={mirrorX === -1}
        on="开 · mirrorX=-1"
        off="关 · mirrorX=1"
        onChange={() => onMirrorXChange(mirrorX === -1 ? 1 : -1)}
      />
      <Toggle
        label="关键点叠加"
        pressed={overlay}
        on="开"
        off="关"
        onChange={() => onOverlayChange(!overlay)}
      />

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono">
        <dt className="text-dim">yaw</dt>
        <dd className="text-right">{frame ? num(frame.yaw) : '—'}</dd>
        <dt className="text-dim">pitch</dt>
        <dd className="text-right">{frame ? num(frame.pitch) : '—'}</dd>
        <dt className="text-dim">blinkL</dt>
        <dd className="text-right">{frame ? num(frame.blinkL) : '—'}</dd>
        <dt className="text-dim">blinkR</dt>
        <dd className="text-right">{frame ? num(frame.blinkR) : '—'}</dd>
        <dt className="text-dim">jaw</dt>
        <dd className="text-right">{frame ? num(frame.jaw) : '—'}</dd>
        <dt className="text-dim">cursorX</dt>
        <dd className="text-right">{num(state.cursorX)}</dd>
        <dt className="text-dim">present</dt>
        <dd className="text-right">{frame ? String(frame.present) : '—'}</dd>
        <dt className="text-dim">delegate</dt>
        <dd className="text-right">{delegate ?? '—'}</dd>
      </dl>

      <div className="flex flex-col gap-1">
        <h3 className="font-bold">engine 事件</h3>
        {eventLog.length === 0 ? (
          <p className="text-dim">暂无</p>
        ) : (
          <ul className="flex flex-col gap-1 font-mono text-sm">
            {eventLog.map((entry, i) => (
              <li key={`${entry.type}-${entry.at}-${i}`} className="flex justify-between">
                <span className="text-accent">{entry.type}</span>
                <span className="text-dim">{clock(entry.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
