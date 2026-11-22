import {
  BLINK_TRIGGER,
  CONFIRM_BLINK_COUNT,
  CONFIRM_BLINK_GAP_MS,
  CONFIRM_BLINK_MIN_CLOSED_MS,
  MAX_PLAUSIBLE,
  MIN_NOD_MAGNITUDE,
  MIN_TURN_MAGNITUDE,
  NEUTRAL_MAX_SPREAD,
  STEP_COUNT,
  STEP_ORDER,
  captureFor,
  initialMeasurements,
  type Measurements,
  type Sample,
  type StepId,
} from './steps';
import { isPlausible, isStable, meetsMin, medianOfLargest, mean, oppositeSign } from './sampling';
import { DEFAULT_CONFIG } from '../input/config';

/**
 * 校准流程本体：纯 reducer，时间只从 action.t（= frame.t，performance.now 单调）来，
 * 不碰 Date.now / performance.now，不碰 DOM。所以能在 node 里用合成帧整条跑一遍。
 *
 * 步与步之间只有一个推进条件：这一步的窗口填满并且判定合格。
 * 合格线没过 → attempt 1 自动重采一次；attempt 2 还不过 → 停在这一步等人工（重做 / 用默认值）。
 */

export type CalStep = StepId | 'confirm';
export type StepStatus = 'leading' | 'capturing' | 'captured' | 'giveUp';
export type FinishKind = 'measured' | 'defaults';

export type CalState = {
  step: CalStep;
  status: StepStatus;
  /** 同一步最多自动重采一次，所以只有 1 和 2 */
  attempt: 1 | 2;
  /** 本步开始的时刻，用来量 lead；null 表示还没收到第一帧 */
  startedAtT: number | null;
  samples: Sample[];
  /** 本次闭眼的起始时刻；null 表示眼睛是张开的 */
  blinkSince: number | null;
  /** 上一次「算数」的眨眼结束时刻，用来挡同一次闭合被数两遍 */
  lastBlinkT: number | null;
  blinkCount: number;
  lastFrameT: number | null;
  measurements: Measurements;
  retriedSteps: StepId[];
  finished: FinishKind | null;
};

export type FrameInput = {
  yaw: number;
  pitch: number;
  blink: number;
  t: number;
  present: boolean;
};

export type CalAction =
  | ({ type: 'frame' } & FrameInput)
  | { type: 'manualConfirm' }
  | { type: 'redoStep' }
  | { type: 'useDefaults' }
  | { type: 'reset' };

export const initialCalibration: CalState = {
  step: 'neutral',
  status: 'leading',
  attempt: 1,
  startedAtT: null,
  samples: [],
  blinkSince: null,
  lastBlinkT: null,
  blinkCount: 0,
  lastFrameT: null,
  measurements: initialMeasurements(),
  retriedSteps: [],
  finished: null,
};

function stepIndex(step: CalStep): number {
  const i = STEP_ORDER.indexOf(step as StepId);
  return i < 0 ? STEP_ORDER.length : i;
}

function nextStep(step: CalStep): CalStep | null {
  if (step === 'confirm') return null;
  const i = STEP_ORDER.indexOf(step);
  if (i < 0) return null;
  return i === STEP_ORDER.length - 1 ? 'confirm' : STEP_ORDER[i + 1]!;
}

/** 开一步：清缓冲、清眨眼计数、attempt 回到 1。 */
function beginStep(s: CalState, step: CalStep): CalState {
  return {
    ...s,
    step,
    status: 'leading',
    attempt: 1,
    startedAtT: null,
    samples: [],
    blinkSince: null,
    lastBlinkT: null,
    blinkCount: 0,
  };
}

/** 只有采样步会失败；眨眼确认有空格兜底，不存在「过不了」。 */
function fail(s: CalState): CalState {
  if (s.attempt === 1) {
    const step = s.step as StepId;
    return {
      ...s,
      attempt: 2,
      status: 'leading',
      startedAtT: null,
      samples: [],
      retriedSteps: s.retriedSteps.includes(step) ? s.retriedSteps : [...s.retriedSteps, step],
    };
  }
  return { ...s, status: 'giveUp', startedAtT: null, samples: [] };
}

function done(s: CalState, measurements: Measurements): CalState {
  const next = nextStep(s.step);
  const withM = { ...s, measurements };
  if (next === null) return { ...withM, finished: 'measured', status: 'captured' };
  return beginStep(withM, next);
}

function judge(s: CalState): CalState {
  const m = s.measurements;

  if (s.step === 'neutral') {
    const ys = s.samples.map((x) => x.yaw);
    const ps = s.samples.map((x) => x.pitch);
    // 定不住就别存中性位，否则把「歪着头」当成正对，后面全程跟着歪
    if (!isStable(ys, NEUTRAL_MAX_SPREAD) || !isStable(ps, NEUTRAL_MAX_SPREAD)) return fail(s);
    return done(s, { ...m, yawNeutral: mean(ys), pitchNeutral: mean(ps) });
  }

  if (s.step === 'turnLeft' || s.step === 'turnRight') {
    const spec = captureFor(s.step);
    const offs = s.samples.map((x) => x.yaw - m.yawNeutral);
    const peak = medianOfLargest(offs, spec.peakK ?? offs.length);
    const mag = Math.abs(peak);
    if (!meetsMin(mag, MIN_TURN_MAGNITUDE) || !isPlausible(mag, MAX_PLAUSIBLE)) return fail(s);
    const other = s.step === 'turnLeft' ? m.rightOffset : m.leftOffset;
    // 两步转了同一边：量程只会覆盖一侧，另一侧走不到边缘，判失败重采
    if (
      other !== null &&
      meetsMin(Math.abs(other), MIN_TURN_MAGNITUDE) &&
      !oppositeSign(peak, other)
    ) {
      return fail(s);
    }
    return done(s, s.step === 'turnLeft' ? { ...m, leftOffset: peak } : { ...m, rightOffset: peak });
  }

  if (s.step === 'nod') {
    const spec = captureFor('nod');
    const offs = s.samples.map((x) => x.pitch - m.pitchNeutral);
    const peak = Math.abs(medianOfLargest(offs, spec.peakK ?? offs.length));
    if (!meetsMin(peak, MIN_NOD_MAGNITUDE) || !isPlausible(peak, MAX_PLAUSIBLE)) return fail(s);
    return done(s, { ...m, nodPeakOffset: peak });
  }

  return s;
}

function advanceConfirm(s: CalState, f: FrameInput): CalState {
  if (f.blink > BLINK_TRIGGER) {
    return { ...s, blinkSince: s.blinkSince ?? f.t };
  }
  if (s.blinkSince === null) return s;

  const heldMs = f.t - s.blinkSince;
  const spaced = s.lastBlinkT === null || f.t - s.lastBlinkT >= CONFIRM_BLINK_GAP_MS;
  const counted = heldMs >= CONFIRM_BLINK_MIN_CLOSED_MS && spaced;
  const blinkCount = counted ? s.blinkCount + 1 : s.blinkCount;
  const next: CalState = {
    ...s,
    blinkSince: null,
    blinkCount,
    lastBlinkT: counted ? f.t : s.lastBlinkT,
  };
  return blinkCount >= CONFIRM_BLINK_COUNT
    ? { ...next, finished: 'measured', status: 'captured' }
    : next;
}

function advanceFrame(s: CalState, f: FrameInput): CalState {
  if (s.finished !== null) return s;
  // 同一帧被重投（StrictMode 双跑、上层重复 dispatch）：t 不前进就整帧忽略，缓冲不会双计
  if (s.lastFrameT !== null && f.t <= s.lastFrameT) return s;

  if (!f.present) {
    // absent 帧的 yaw/pitch 是 0，喂进缓冲会把峰值拖低；lead 重来，但不消耗 attempt
    return { ...s, lastFrameT: f.t, startedAtT: null, samples: [] };
  }

  if (s.status === 'captured' || s.status === 'giveUp') return { ...s, lastFrameT: f.t };

  const base: CalState = { ...s, lastFrameT: f.t };
  if (base.startedAtT === null) return { ...base, startedAtT: f.t };

  const spec = captureFor(base.step);
  if (base.status === 'leading') {
    if (f.t - base.startedAtT < spec.leadMs) return base;
    return base.step === 'confirm'
      ? advanceConfirm({ ...base, status: 'capturing' }, f)
      : { ...base, status: 'capturing', samples: [] };
  }

  if (base.step === 'confirm') return advanceConfirm(base, f);

  const samples = [...base.samples, { t: f.t, yaw: f.yaw, pitch: f.pitch }];
  // 窗口满就停表判定；不再往后攒帧，也不因为「攒超了」判失败
  if (samples.length < spec.windowFrames) return { ...base, samples };
  return judge({ ...base, samples });
}

export function advance(s: CalState, a: CalAction): CalState {
  switch (a.type) {
    case 'reset':
      return initialCalibration;
    case 'useDefaults':
      // 整条流程作废、回到引擎自带量程，什么都不写盘 —— 和「跳过，使用默认值」同一条路
      return s.finished === null
        ? { ...s, finished: 'defaults', status: 'captured', samples: [] }
        : s;
    case 'manualConfirm':
      if (s.finished !== null || s.step !== 'confirm') return s;
      return { ...s, finished: 'measured', status: 'captured' };
    case 'redoStep':
      if (s.finished !== null || s.status !== 'giveUp') return s;
      return beginStep(s, s.step);
    case 'frame':
      return advanceFrame(s, a);
  }
}

export function isComplete(s: CalState): boolean {
  return s.finished !== null;
}

export function currentStep(s: CalState): { step: CalStep; index: number; total: number } {
  return { step: s.step, index: stepIndex(s.step) + 1, total: STEP_COUNT };
}

export function progressOf(s: CalState): number {
  if (s.finished !== null) return 1;
  const spec = captureFor(s.step);
  let within = 0;
  if (s.status === 'capturing' || s.status === 'captured') {
    within =
      s.step === 'confirm'
        ? s.blinkCount / CONFIRM_BLINK_COUNT
        : Math.min(1, s.samples.length / Math.max(1, spec.windowFrames));
  }
  return Math.min(1, (stepIndex(s.step) + within) / STEP_COUNT);
}

export type LiveReadout = {
  axis: 'yaw' | 'pitch';
  /** 相对中性位的带符号偏移 */
  offset: number;
  /** 这一侧要够到的参考幅度（= 钳位上限），条子超过它就说明灵敏度被压了 */
  target: number;
  capturing: boolean;
  /** 本步窗口进度 0~1，给偏移条旁边的小计数用 */
  windowProgress: number;
};

/**
 * 实时偏移条的数据源。校准页显示的是「走到这儿够不够」，
 * 用的数学和游戏里的光标同一个函数，不会出现两边说法不一致。
 */
export function liveReadout(s: CalState, f: { yaw: number; pitch: number }): LiveReadout {
  const spec = captureFor(s.step);
  const windowProgress =
    s.step === 'confirm'
      ? s.blinkCount / CONFIRM_BLINK_COUNT
      : Math.min(1, s.samples.length / Math.max(1, spec.windowFrames));

  if (s.step === 'nod') {
    return {
      axis: 'pitch',
      offset: f.pitch - s.measurements.pitchNeutral,
      target: DEFAULT_CONFIG.pitchRangeMax,
      capturing: s.status === 'capturing',
      windowProgress,
    };
  }
  return {
    axis: 'yaw',
    offset: f.yaw - s.measurements.yawNeutral,
    target: DEFAULT_CONFIG.rangeMax,
    capturing: s.status === 'capturing',
    windowProgress,
  };
}

/** 眨眼确认步给屏幕的剩余次数提示。 */
export function blinksLeft(s: CalState): number {
  return Math.max(0, CONFIRM_BLINK_COUNT - s.blinkCount);
}
