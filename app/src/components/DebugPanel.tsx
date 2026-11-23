import type { GestureConfig } from '../input/config';
import { DEFAULT_CALIBRATION } from '../input/gestureEngine';
import type { Calibration, GestureEvent, InputState, RawFrame } from '../input/types';
import type { Peaks } from '../hooks/useDebugTrace';

interface DebugPanelProps {
  frame: RawFrame | null;
  state: InputState;
  eventLog: { type: GestureEvent; at: number }[];
  mirrorX: GestureConfig['mirrorX'];
  onMirrorXChange: (value: GestureConfig['mirrorX']) => void;
  overlay: boolean;
  onOverlayChange: (value: boolean) => void;
  delegate: 'GPU' | 'CPU' | null;
  calibration: Required<Calibration>;
  peaks: Peaks;
  rows: number;
  onResetPeaks: () => void;
  onExportCsv: () => void;
  onClose: () => void;
}

const num = (value: number): string => value.toFixed(3);

/** 一眼看出这次玩的是校准过的量程还是引擎默认值。 */
function isDefaultRange(c: Required<Calibration>): boolean {
  return (
    c.range === DEFAULT_CALIBRATION.range &&
    c.pitchRange === DEFAULT_CALIBRATION.pitchRange &&
    c.yawNeutral === 0 &&
    c.pitchNeutral === 0
  );
}

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

function PanelButton({
  children,
  onClick,
  disabled = false,
}: {
  children: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex-1 rounded-lg border-2 border-edge bg-page px-3 py-2 text-base font-bold disabled:opacity-40"
    >
      {children}
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
  calibration,
  peaks,
  rows,
  onResetPeaks,
  onExportCsv,
  onClose,
}: DebugPanelProps) {
  return (
    <section
      aria-label="调试面板"
      className="fixed right-4 top-4 z-50 flex max-h-[calc(100dvh-2rem)] w-72 flex-col gap-3 overflow-y-auto rounded-card border-2 border-edge bg-card p-4 text-base shadow-lg"
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
        <dd className="text-right">
          {delegate ? (
            <>
              {delegate}
              <span className="block text-xs text-dim">（已请求，实际后端由 MediaPipe 决定）</span>
            </>
          ) : '—'}
        </dd>
      </dl>

      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 font-bold">
          生效量程
          <span className="rounded-full border-2 border-edge px-2 py-0.5 text-xs font-normal text-dim">
            {isDefaultRange(calibration) ? '默认' : '已校准'}
          </span>
        </h3>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono">
          <dt className="text-dim">yawRange</dt>
          <dd className="text-right">{num(calibration.range)}</dd>
          <dt className="text-dim">pitchRange</dt>
          <dd className="text-right">{num(calibration.pitchRange)}</dd>
          <dt className="text-dim">中性 yaw</dt>
          <dd className="text-right">{num(calibration.yawNeutral)}</dd>
          <dt className="text-dim">中性 pitch</dt>
          <dd className="text-right">{num(calibration.pitchNeutral)}</dd>
        </dl>
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="font-bold">峰值保持（本次会话）</h3>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono">
          <dt className="text-dim">max |yaw|</dt>
          <dd className="text-right font-bold text-ring">{num(peaks.absYaw)}</dd>
          <dt className="text-dim">max pitch</dt>
          <dd className="text-right font-bold text-ring">{num(peaks.pitch)}</dd>
          <dt className="text-dim">max blinkL</dt>
          <dd className="text-right font-bold text-ring">{num(peaks.blinkL)}</dd>
          <dt className="text-dim">max blinkR</dt>
          <dd className="text-right font-bold text-ring">{num(peaks.blinkR)}</dd>
          <dt className="text-dim">max jaw</dt>
          <dd className="text-right font-bold text-ring">{num(peaks.jaw)}</dd>
          <dt className="text-dim">confirm 次数</dt>
          <dd className="text-right font-bold text-ring">{peaks.confirm}</dd>
          <dt className="text-dim">pause 次数</dt>
          <dd className="text-right font-bold text-ring">{peaks.pause}</dd>
        </dl>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <PanelButton onClick={onResetPeaks}>重置峰值</PanelButton>
          <PanelButton onClick={onExportCsv} disabled={rows === 0}>
            导出 CSV
          </PanelButton>
        </div>
        <p className="text-xs text-dim">
          CSV 是最近 60 秒的逐帧数据（当前 {rows} 帧），带 UTF-8 BOM，Excel 可直接打开。
        </p>
      </div>

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
