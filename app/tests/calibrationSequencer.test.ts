import { describe, expect, it } from 'vitest';
import {
  advance,
  blinksLeft,
  currentStep,
  initialCalibration,
  isComplete,
  liveReadout,
  progressOf,
  type CalState,
  type FrameInput,
} from '../src/calibration/sequencer';
import { buildCalibration, toEngineCalibration } from '../src/calibration/result';
import { GestureEngine } from '../src/input/gestureEngine';

const STEP = 33;
let t = 0;

type Feed = { yaw?: number; pitch?: number; blink?: number; present?: boolean };

function one(s: CalState, v: Feed = {}): CalState {
  t += STEP;
  const f: FrameInput & { type: 'frame' } = {
    type: 'frame',
    yaw: v.yaw ?? 0,
    pitch: v.pitch ?? 0,
    blink: v.blink ?? 0,
    present: v.present ?? true,
    t,
  };
  return advance(s, f);
}

/** 喂到这一步结束（进下一步 / giveUp / 完成）。超过上限当作没走完，直接炸测试。 */
function settle(s: CalState, v: Feed): CalState {
  const step = s.step;
  let cur = s;
  for (let i = 0; i < 800; i++) {
    cur = one(cur, v);
    if (cur.step !== step || cur.status === 'giveUp' || cur.finished !== null) return cur;
  }
  throw new Error(`settle: ${step} 步没走完`);
}

/** 一次完整眨眼：闭 3 帧、张 4 帧（张开的间隔同时满足两次眨眼的最小间隔）。 */
function blink(s: CalState): CalState {
  let cur = s;
  for (let i = 0; i < 3; i++) cur = one(cur, { blink: 0.9 });
  for (let i = 0; i < 4; i++) cur = one(cur, { blink: 0 });
  return cur;
}

/** 一路做到眨眼确认这一步。 */
function toConfirmStep(): CalState {
  let s = settle(initialCalibration, {});
  s = settle(s, { yaw: 0.38 });
  s = settle(s, { yaw: -0.34 });
  s = settle(s, { pitch: 0.2 });
  return s;
}

describe('calibration/sequencer', () => {
  it('真人实测数字一路走完：4 步顺序推进，量程按小边取、按上限压', () => {
    t = 0;
    let s = initialCalibration;
    s = settle(s, {});
    expect(s.step).toBe('turnLeft');
    s = settle(s, { yaw: 0.38 });
    expect(s.step).toBe('turnRight');
    s = settle(s, { yaw: -0.34 });
    expect(s.step).toBe('nod');
    s = settle(s, { pitch: 0.2 });
    expect(s.step).toBe('confirm');
    expect(s.measurements.leftOffset).toBeCloseTo(0.38, 6);
    expect(s.measurements.rightOffset).toBeCloseTo(-0.34, 6);
    expect(s.measurements.nodPeakOffset).toBeCloseTo(0.2, 6);

    expect(blinksLeft(s)).toBe(2);
    s = blink(s);
    expect(blinksLeft(s)).toBe(1);
    expect(isComplete(s)).toBe(false);
    s = blink(s);
    expect(isComplete(s)).toBe(true);
    expect(s.finished).toBe('measured');

    const r = buildCalibration(s.measurements);
    // min(0.38, 0.34) = 0.34 → 压到 rangeMax
    expect(r.yawRange).toBe(0.22);
    expect(r.yawClampedToMax).toBe(true);
    expect(r.sensitivity).toBe(100);
    // 0.2 - 中性位 0 = 0.2 → 压到 pitchRangeMax
    expect(r.pitchRange).toBe(0.18);
    expect(r.pitchCapped).toBe(true);
  });

  it('校准结果喂进引擎后：0.19 的点头触发，0.34 的转头走到边缘', () => {
    t = 0;
    const r = buildCalibration(toConfirmStep().measurements);
    const e = new GestureEngine({ mirrorX: -1 });
    e.setCalibration(toEngineCalibration(r));

    let fired = 0;
    for (let i = 0; i < 20; i++) {
      t += STEP;
      const out = e.update({ t, yaw: 0, pitch: 0.19, blinkL: 0, blinkR: 0, jaw: 0, present: true });
      fired += out.events.filter((x) => x === 'confirm').length;
    }
    expect(fired).toBe(1);

    let cursor = 0;
    for (let i = 0; i < 20; i++) {
      t += STEP;
      cursor = e.update({
        t,
        yaw: -0.34,
        pitch: 0,
        blinkL: 0,
        blinkR: 0,
        jaw: 0,
        present: true,
      }).state.cursorX;
    }
    // 镜像预览下被摄者向右转头 → 光标到右边缘（+1）；EMA 要几帧才收敛，所以取稳定后的值
    expect(cursor).toBeCloseTo(1, 6);
  });

  it('某步没检测到动作：自动重采一次，再失败就停在原地', () => {
    t = 0;
    let s = settle(initialCalibration, {});
    for (let i = 0; i < 900 && s.status !== 'giveUp'; i++) s = one(s, { yaw: 0 });

    expect(s.step).toBe('turnLeft');
    expect(s.attempt).toBe(2);
    expect(s.retriedSteps).toEqual(['turnLeft']);
    expect(s.measurements.leftOffset).toBeNull();
    expect(isComplete(s)).toBe(false);
  });

  it('giveUp 后「重做这一步」：attempt 回到 1，做得到就往下走', () => {
    t = 0;
    let s = settle(initialCalibration, {});
    for (let i = 0; i < 900 && s.status !== 'giveUp'; i++) s = one(s, { yaw: 0 });
    s = advance(s, { type: 'redoStep' });
    expect(s.attempt).toBe(1);
    expect(s.status).toBe('leading');
    expect(s.step).toBe('turnLeft');

    s = settle(s, { yaw: 0.3 });
    expect(s.step).toBe('turnRight');
    expect(s.measurements.leftOffset).toBeCloseTo(0.3, 6);
  });

  it('giveUp 后「用默认值继续」：整条流程作废，什么都不产生也不写', () => {
    t = 0;
    let s = settle(initialCalibration, {});
    for (let i = 0; i < 900 && s.status !== 'giveUp'; i++) s = one(s, { yaw: 0 });
    s = advance(s, { type: 'useDefaults' });
    expect(isComplete(s)).toBe(true);
    expect(s.finished).toBe('defaults');
    expect(s.measurements.leftOffset).toBeNull();

    // 完成后继续来帧也不该再动状态
    const after = one(s, { yaw: 0.4 });
    expect(after.finished).toBe('defaults');
    expect(after.step).toBe('turnLeft');
  });

  it('丢脸帧不进缓冲、也不消耗 attempt', () => {
    t = 0;
    let s = settle(initialCalibration, {});
    for (let i = 0; i < 20; i++) s = one(s, { yaw: 0.3 });
    for (let i = 0; i < 12; i++) s = one(s, { yaw: 0, present: false });
    expect(s.attempt).toBe(1);
    expect(s.samples.length).toBe(0);

    s = settle(s, { yaw: 0.3 });
    expect(s.step).toBe('turnRight');
    expect(s.measurements.leftOffset).toBeCloseTo(0.3, 6);
  });

  it('同一帧被重投（StrictMode / 重复 dispatch）整帧忽略，缓冲不会双计', () => {
    t = 0;
    const f: FrameInput & { type: 'frame' } = {
      type: 'frame',
      yaw: 0.3,
      pitch: 0,
      blink: 0,
      present: true,
      t: 1000,
    };
    const a = advance(initialCalibration, f);
    expect(a.lastFrameT).toBe(1000);
    expect(advance(a, f)).toBe(a);
  });

  it('空格只在眨眼确认这一步算确认', () => {
    t = 0;
    expect(advance(initialCalibration, { type: 'manualConfirm' })).toBe(initialCalibration);

    let s = toConfirmStep();
    expect(isComplete(s)).toBe(false);
    s = advance(s, { type: 'manualConfirm' });
    expect(isComplete(s)).toBe(true);
    expect(s.finished).toBe('measured');
  });

  it('两步转了同一边：判不合格重采，不会只校出一侧的量程', () => {
    t = 0;
    let s = settle(initialCalibration, {});
    s = settle(s, { yaw: 0.3 });
    for (let i = 0; i < 900 && s.status !== 'giveUp'; i++) s = one(s, { yaw: 0.28 });
    expect(s.step).toBe('turnRight');
    expect(s.attempt).toBe(2);
    expect(s.retriedSteps).toContain('turnRight');
  });

  it('正对这一步定不住：极差超限走同一条重试路径', () => {
    t = 0;
    let s = initialCalibration;
    for (let i = 0; i < 900 && s.status !== 'giveUp'; i++) s = one(s, { yaw: i % 2 ? 0.2 : -0.2 });
    expect(s.step).toBe('neutral');
    expect(s.status).toBe('giveUp');
    expect(s.measurements.yawNeutral).toBe(0);
  });

  it('窗口满就停表，不继续攒帧', () => {
    t = 0;
    let s = settle(initialCalibration, {});
    s = settle(s, { yaw: 0.3 });
    // 进下一步后缓冲是空的，而不是把上一步的尾巴带过来
    expect(s.step).toBe('turnRight');
    expect(s.samples.length).toBe(0);
  });

  it('progressOf 在顺利走完的整条路上单调递增，完成时到 1', () => {
    t = 0;
    let s = initialCalibration;
    let prev = progressOf(s);
    expect(prev).toBe(0);
    for (const v of [{}, { yaw: 0.38 }, { yaw: -0.34 }, { pitch: 0.2 }] as Feed[]) {
      s = settle(s, v);
      expect(progressOf(s) >= prev).toBe(true);
      prev = progressOf(s);
    }
    s = blink(s);
    s = blink(s);
    expect(progressOf(s)).toBe(1);
    expect(currentStep(s).total).toBe(5);
  });

  it('实时偏移条：转头用 yaw、点头用 pitch，参考线就是钳位上限', () => {
    t = 0;
    const turn = liveReadout(settle(initialCalibration, {}), { yaw: 0.3, pitch: 0 });
    expect(turn.axis).toBe('yaw');
    expect(turn.offset).toBeCloseTo(0.3, 6);
    expect(turn.target).toBe(0.22);

    let s = settle(initialCalibration, {});
    s = settle(s, { yaw: 0.38 });
    s = settle(s, { yaw: -0.34 });
    const nod = liveReadout(s, { yaw: 0, pitch: 0.25 });
    expect(nod.axis).toBe('pitch');
    expect(nod.target).toBe(0.18);
  });

  it('reset 回到第 1 步起点', () => {
    t = 0;
    const s = advance(toConfirmStep(), { type: 'reset' });
    expect(s).toBe(initialCalibration);
  });
});
