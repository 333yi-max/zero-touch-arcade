import { describe, it, expect } from 'vitest';
import { buildCsv } from '../src/hooks/useDebugTrace';
import type { TraceRow } from '../src/hooks/useDebugTrace';

const row = (over: Partial<TraceRow> = {}): TraceRow => ({
  t: 1234.56,
  yaw: -0.12345,
  pitch: 0.02,
  blinkL: 0.9,
  blinkR: 0.88,
  jaw: 0,
  cursorX: -0.5,
  present: true,
  event: '',
  ...over,
});

describe('buildCsv', () => {
  it('以 UTF-8 BOM 开头，Excel 打开中文表头不乱码', () => {
    expect(buildCsv([row()]).charCodeAt(0)).toBe(0xfeff);
  });

  it('第一行是约定好的九列', () => {
    const header = buildCsv([]).slice(1).split('\r\n')[0];
    expect(header).toBe('t,yaw,pitch,blinkL,blinkR,jaw,cursorX,present,event');
  });

  it('数值定宽、t 取整、event 没有就是空字段', () => {
    const line = buildCsv([row()]).slice(1).split('\r\n')[1];
    expect(line).toBe('1235,-0.1235,0.0200,0.9000,0.8800,0.0000,-0.5000,true,');
  });

  it('event 只会出现 confirm 或 pause', () => {
    const lines = buildCsv([row({ event: 'confirm' }), row({ event: 'pause', present: false })])
      .slice(1)
      .split('\r\n')
      .filter((l) => l.length > 0)
      .slice(1);
    expect(lines[0].endsWith('confirm')).toBe(true);
    expect(lines[1].endsWith('false,pause')).toBe(true);
  });

  it('空缓冲也产出只有表头的合法文件，行尾统一 CRLF', () => {
    const csv = buildCsv([]);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(2);
  });
});
