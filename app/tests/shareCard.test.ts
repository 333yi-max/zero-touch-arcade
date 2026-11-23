import { describe, expect, it } from 'vitest';
import {
  FONT_STACK,
  SHARE_HEIGHT,
  SHARE_WIDTH,
  drawShareCard,
  shareCardFileName,
} from '../src/game/shareCard';

interface FakeCtx {
  ops: string[];
  texts: string[];
}

/** 假 ctx：只记录绘制命令，不做任何真实渲染。 */
function fakeCtx(): FakeCtx & CanvasRenderingContext2D {
  const ops: string[] = [];
  const texts: string[] = [];
  const gradient = {
    addColorStop: (offset: number, color: string) => {
      ops.push(`stop ${offset} ${color}`);
    },
  };
  const ctx = {
    ops,
    texts,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: 'butt',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    save: () => ops.push('save'),
    restore: () => ops.push('restore'),
    beginPath: () => ops.push('beginPath'),
    fill: () => ops.push('fill'),
    stroke: () => ops.push('stroke'),
    fillRect: (x: number, y: number, w: number, h: number) => ops.push(`fillRect ${x} ${y} ${w} ${h}`),
    strokeRect: (x: number, y: number, w: number, h: number) =>
      ops.push(`strokeRect ${x} ${y} ${w} ${h}`),
    arc: (x: number, y: number, r: number) => ops.push(`arc ${x} ${y} ${r}`),
    fillText: (text: string) => {
      texts.push(text);
      ops.push(`fillText ${text}`);
    },
    createLinearGradient: () => gradient,
  };
  return ctx as unknown as FakeCtx & CanvasRenderingContext2D;
}

describe('game/shareCard', () => {
  it('文件名：本地日期补零，形如 zero-touch-score-YYYYMMDD.png', () => {
    expect(shareCardFileName(new Date(2026, 0, 5))).toBe('zero-touch-score-20260105.png');
    expect(shareCardFileName(new Date(2026, 10, 23))).toBe('zero-touch-score-20261123.png');
  });

  it('drawShareCard：背景渐变铺满 1080×1440，save/restore 配对', () => {
    const ctx = fakeCtx();
    drawShareCard(ctx, { game: 'star', score: 410, date: new Date(2026, 10, 23) });
    expect(ctx.ops).toContain('save');
    expect(ctx.ops).toContain('restore');
    expect(ctx.ops).toContain(`fillRect 0 0 ${SHARE_WIDTH} ${SHARE_HEIGHT}`);
    expect(ctx.ops).toContain('stop 0 #0a0f1f');
    expect(ctx.ops).toContain('stop 1 #16203c');
  });

  it('drawShareCard：分数、游戏名、口号、本地日期都画成文字', () => {
    const ctx = fakeCtx();
    drawShareCard(ctx, { game: 'rhythm', score: 1400, date: new Date(2026, 10, 23) });
    expect(ctx.texts).toContain('1400');
    expect(ctx.texts).toContain('节奏点头');
    expect(ctx.texts).toContain('我不用手也能玩');
    expect(ctx.texts).toContain('2026年11月23日');
  });

  it('drawShareCard：脸部图标 = 1 个头 + 2 只眼 + 1 条微笑，全用路径', () => {
    const ctx = fakeCtx();
    drawShareCard(ctx, { game: 'star', score: 0, date: new Date(2026, 10, 23) });
    const arcs = ctx.ops.filter((op) => op.startsWith('arc'));
    expect(arcs).toHaveLength(4);
    const strokes = ctx.ops.filter((op) => op === 'stroke');
    expect(strokes).toHaveLength(2); // 头 + 微笑（边框是 strokeRect）
  });

  it('中文字体走系统字体栈，不引字体文件', () => {
    expect(FONT_STACK).toContain('Microsoft YaHei');
  });
});
