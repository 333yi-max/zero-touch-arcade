import { describe, expect, it } from 'vitest';
import { GestureEngine } from '../src/input/gestureEngine';
import type { RawFrame } from '../src/input/types';

const STEP = 33;
let now = 0;

function frame(over: Partial<RawFrame> = {}): RawFrame {
  now += STEP;
  return {
    t: now,
    yaw: 0,
    pitch: 0,
    blinkL: 0,
    blinkR: 0,
    jaw: 0,
    present: true,
    ...over,
  };
}

function run(
  engine: GestureEngine,
  n: number,
  over: Partial<RawFrame> = {},
) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(engine.update(frame(over)));
  return out;
}

function eventsOf(results: ReturnType<typeof run>) {
  return results.flatMap((r) => r.events);
}

describe('GestureEngine', () => {
  it('中性帧：光标为 0，不触发事件', () => {
    now = 0;
    const e = new GestureEngine();
    const r = run(e, 20);
    expect(r.at(-1)!.state.cursorX).toBe(0);
    expect(eventsOf(r)).toEqual([]);
  });

  it('向右转头：光标为正（cursor > 0.3）', () => {
    now = 0;
    const e = new GestureEngine();
    const r = run(e, 20, { yaw: 0.12 });
    expect(r.at(-1)!.state.cursorX > 0.3).toBeTruthy();
  });

  it('镜像：mirrorX=-1 时方向翻转（cursor < -0.3）', () => {
    now = 0;
    const e = new GestureEngine({ mirrorX: -1 });
    const r = run(e, 20, { yaw: 0.12 });
    expect(r.at(-1)!.state.cursorX < -0.3).toBeTruthy();
  });

  it('点头：触发一次 confirm，按住不连发', () => {
    now = 0;
    const e = new GestureEngine();
    const a = run(e, 20, { pitch: 0.15 });
    expect(eventsOf(a).filter((x) => x === 'confirm').length).toBe(1);
    const b = run(e, 20, { pitch: 0.15 });
    expect(eventsOf(b).filter((x) => x === 'confirm').length).toBe(0);
  });

  it('点头：回中后可再次触发', () => {
    now = 0;
    const e = new GestureEngine();
    run(e, 20, { pitch: 0.15 });
    run(e, 12, { pitch: 0 });
    const c = run(e, 20, { pitch: 0.15 });
    expect(eventsOf(c).filter((x) => x === 'confirm').length).toBe(1);
  });

  it('眨眼：双眼闭合触发 confirm', () => {
    now = 0;
    const e = new GestureEngine();
    const r = run(e, 12, { blinkL: 0.8, blinkR: 0.8 });
    expect(eventsOf(r).filter((x) => x === 'confirm').length).toBe(1);
  });

  it('眨眼：只闭一只眼不触发', () => {
    now = 0;
    const e = new GestureEngine();
    const r = run(e, 20, { blinkL: 0.9, blinkR: 0 });
    expect(eventsOf(r).filter((x) => x === 'confirm').length).toBe(0);
  });

  it('张嘴：触发一次 pause', () => {
    now = 0;
    const e = new GestureEngine();
    const r = run(e, 20, { jaw: 0.8 });
    expect(eventsOf(r).filter((x) => x === 'pause').length).toBe(1);
  });

  it('张嘴：按住不连发', () => {
    now = 0;
    const e = new GestureEngine();
    run(e, 20, { jaw: 0.8 });
    const r = run(e, 20, { jaw: 0.8 });
    expect(eventsOf(r).filter((x) => x === 'pause').length).toBe(0);
  });

  it('校准量程：小范围放大到 0.08，大范围压到 0.22', () => {
    const e = new GestureEngine();
    expect(e.setRangeFromOffsets(-0.03, 0.03)).toBe(0.08);
    expect(e.setRangeFromOffsets(-0.5, 0.4)).toBe(0.22);
  });

  it('活动范围小的人：偏移 0.09 也能走满光标（cursor > 0.7）', () => {
    now = 0;
    const e = new GestureEngine();
    e.setRangeFromOffsets(-0.03, 0.03);
    const r = run(e, 20, { yaw: 0.09 });
    expect(r.at(-1)!.state.cursorX > 0.7).toBeTruthy();
  });

  it('人脸丢失：光标归零，不触发事件', () => {
    now = 0;
    const e = new GestureEngine();
    const r = run(e, 10, { present: false, pitch: 0.5, jaw: 0.9 });
    expect(r.at(-1)!.state.cursorX).toBe(0);
    expect(eventsOf(r)).toEqual([]);
  });

  it('校准中性位：偏移按中性位计算（|cursor| < 0.01）', () => {
    now = 0;
    const e = new GestureEngine();
    const samples: RawFrame[] = [];
    for (let i = 0; i < 10; i++) {
      samples.push({
        t: i * STEP,
        yaw: 0.1,
        pitch: 0.05,
        blinkL: 0,
        blinkR: 0,
        jaw: 0,
        present: true,
      });
    }
    e.calibrateNeutral(samples);
    // 保持在中性位，不应该有光标偏移
    const r = run(e, 20, { yaw: 0.1, pitch: 0.05 });
    expect(Math.abs(r.at(-1)!.state.cursorX) < 0.01).toBeTruthy();
  });
});
