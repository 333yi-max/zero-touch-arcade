import assert from 'node:assert/strict';
import { GestureEngine } from './gestureEngine.ts';
import type { RawFrame } from './types.ts';

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

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (err) {
    console.error('FAIL  ' + name);
    throw err;
  }
}

console.log('GestureEngine selftest');

test('中性帧：光标为 0，不触发事件', () => {
  now = 0;
  const e = new GestureEngine();
  const r = run(e, 20);
  assert.equal(r.at(-1)!.state.cursorX, 0);
  assert.deepEqual(eventsOf(r), []);
});

test('向右转头：光标为正', () => {
  now = 0;
  const e = new GestureEngine();
  const r = run(e, 20, { yaw: 0.12 });
  assert.ok(r.at(-1)!.state.cursorX > 0.3, 'cursor=' + r.at(-1)!.state.cursorX);
});

test('镜像：mirrorX=-1 时方向翻转', () => {
  now = 0;
  const e = new GestureEngine({ mirrorX: -1 });
  const r = run(e, 20, { yaw: 0.12 });
  assert.ok(r.at(-1)!.state.cursorX < -0.3, 'cursor=' + r.at(-1)!.state.cursorX);
});

test('点头：触发一次 confirm，按住不连发', () => {
  now = 0;
  const e = new GestureEngine();
  const a = run(e, 20, { pitch: 0.15 });
  assert.equal(eventsOf(a).filter((x) => x === 'confirm').length, 1);
  const b = run(e, 20, { pitch: 0.15 });
  assert.equal(eventsOf(b).filter((x) => x === 'confirm').length, 0);
});

test('点头：回中后可再次触发', () => {
  now = 0;
  const e = new GestureEngine();
  run(e, 20, { pitch: 0.15 });
  run(e, 12, { pitch: 0 });
  const c = run(e, 20, { pitch: 0.15 });
  assert.equal(eventsOf(c).filter((x) => x === 'confirm').length, 1);
});

test('眨眼：双眼闭合触发 confirm', () => {
  now = 0;
  const e = new GestureEngine();
  const r = run(e, 12, { blinkL: 0.8, blinkR: 0.8 });
  assert.equal(eventsOf(r).filter((x) => x === 'confirm').length, 1);
});

test('眨眼：只闭一只眼不触发', () => {
  now = 0;
  const e = new GestureEngine();
  const r = run(e, 20, { blinkL: 0.9, blinkR: 0 });
  assert.equal(eventsOf(r).filter((x) => x === 'confirm').length, 0);
});

test('张嘴：触发一次 pause', () => {
  now = 0;
  const e = new GestureEngine();
  const r = run(e, 20, { jaw: 0.8 });
  assert.equal(eventsOf(r).filter((x) => x === 'pause').length, 1);
});

test('张嘴：按住不连发', () => {
  now = 0;
  const e = new GestureEngine();
  run(e, 20, { jaw: 0.8 });
  const r = run(e, 20, { jaw: 0.8 });
  assert.equal(eventsOf(r).filter((x) => x === 'pause').length, 0);
});

test('校准量程：小范围放大到 0.08，大范围压到 0.22', () => {
  const e = new GestureEngine();
  assert.equal(e.setRangeFromOffsets(-0.03, 0.03), 0.08);
  assert.equal(e.setRangeFromOffsets(-0.5, 0.4), 0.22);
});

test('活动范围小的人：偏移 0.09 也能走满光标', () => {
  now = 0;
  const e = new GestureEngine();
  e.setRangeFromOffsets(-0.03, 0.03);
  const r = run(e, 20, { yaw: 0.09 });
  assert.ok(r.at(-1)!.state.cursorX > 0.7, 'cursor=' + r.at(-1)!.state.cursorX);
});

test('人脸丢失：光标归零，不触发事件', () => {
  now = 0;
  const e = new GestureEngine();
  const r = run(e, 10, { present: false, pitch: 0.5, jaw: 0.9 });
  assert.equal(r.at(-1)!.state.cursorX, 0);
  assert.deepEqual(eventsOf(r), []);
});

test('校准中性位：偏移按中性位计算', () => {
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
  assert.ok(Math.abs(r.at(-1)!.state.cursorX) < 0.01);
});

console.log(`\n${passed} tests passed.`);
