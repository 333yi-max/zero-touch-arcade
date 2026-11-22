import { useCallback, useEffect, useRef, useState } from 'react';
import type { GestureEvent, RawFrame } from '../input/types';

/** CSV 与面板只保留最近这么久的逐帧数据。 */
const WINDOW_MS = 60_000;

export interface TraceRow {
  t: number;
  yaw: number;
  pitch: number;
  blinkL: number;
  blinkR: number;
  jaw: number;
  cursorX: number;
  present: boolean;
  event: GestureEvent | '';
}

export interface Peaks {
  absYaw: number;
  pitch: number;
  blinkL: number;
  blinkR: number;
  jaw: number;
  confirm: number;
  pause: number;
}

const ZERO_PEAKS: Peaks = {
  absYaw: 0,
  pitch: 0,
  blinkL: 0,
  blinkR: 0,
  jaw: 0,
  confirm: 0,
  pause: 0,
};

export interface DebugTrace {
  peaks: Peaks;
  rows: number;
  resetPeaks: () => void;
  exportCsv: () => void;
}

const CSV_HEADER = 't,yaw,pitch,blinkL,blinkR,jaw,cursorX,present,event';

/** 纯函数，方便不挂 React 也能测。 */
export function buildCsv(rows: readonly TraceRow[]): string {
  const lines = rows.map((row) =>
    [
      Math.round(row.t),
      row.yaw.toFixed(4),
      row.pitch.toFixed(4),
      row.blinkL.toFixed(4),
      row.blinkR.toFixed(4),
      row.jaw.toFixed(4),
      row.cursorX.toFixed(4),
      String(row.present),
      row.event,
    ].join(','),
  );
  // BOM：没有它，Excel 会把中文表头和 true/false 之外的内容按本地代码页猜
  return `\uFEFF${[CSV_HEADER, ...lines].join('\r\n')}\r\n`;
}

function stamp(at: number): string {
  const d = new Date(at);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * 调试面板的观测记录：峰值保持 + 最近 60 秒逐帧缓冲。
 * 状态放在这里而不是 DebugPanel 内部，因为面板按 D 关掉就会卸载，
 * 峰值和缓冲不能跟着一起清零。
 */
export function useDebugTrace(
  frame: RawFrame | null,
  cursorX: number,
  events: readonly GestureEvent[],
): DebugTrace {
  const rowsRef = useRef<TraceRow[]>([]);
  const peaksRef = useRef<Peaks>({ ...ZERO_PEAKS });
  const lastTRef = useRef<number | null>(null);
  const [peaks, setPeaks] = useState<Peaks>(peaksRef.current);

  useEffect(() => {
    if (!frame) return;
    // frame.t 单调递增，用它挡掉 StrictMode 对同一帧的第二次 effect 回放
    if (frame.t === lastTRef.current) return;
    lastTRef.current = frame.t;

    const event: GestureEvent | '' = events.includes('confirm')
      ? 'confirm'
      : events.includes('pause')
        ? 'pause'
        : '';

    rowsRef.current.push({
      t: frame.t,
      yaw: frame.yaw,
      pitch: frame.pitch,
      blinkL: frame.blinkL,
      blinkR: frame.blinkR,
      jaw: frame.jaw,
      cursorX,
      present: frame.present,
      event,
    });
    const cutoff = frame.t - WINDOW_MS;
    while (rowsRef.current.length > 0 && rowsRef.current[0].t < cutoff) {
      rowsRef.current.shift();
    }

    const next = peaksRef.current;
    let changed = false;
    const hold = (key: keyof Peaks, value: number): void => {
      if (value > next[key]) {
        next[key] = value;
        changed = true;
      }
    };
    hold('absYaw', Math.abs(frame.yaw));
    hold('pitch', frame.pitch);
    hold('blinkL', frame.blinkL);
    hold('blinkR', frame.blinkR);
    hold('jaw', frame.jaw);
    if (event === 'confirm') {
      next.confirm += 1;
      changed = true;
    }
    if (event === 'pause') {
      next.pause += 1;
      changed = true;
    }
    if (changed) setPeaks({ ...next });
  }, [frame, cursorX, events]);

  const resetPeaks = useCallback((): void => {
    peaksRef.current = { ...ZERO_PEAKS };
    setPeaks({ ...ZERO_PEAKS });
  }, []);

  const exportCsv = useCallback((): void => {
    const blob = new Blob([buildCsv(rowsRef.current)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zero-touch-trace-${stamp(Date.now())}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 立刻 revoke 会让 Safari/部分浏览器拿不到数据
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, []);

  return { peaks, rows: rowsRef.current.length, resetPeaks, exportCsv };
}
