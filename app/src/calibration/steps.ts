import { DEFAULT_CONFIG } from '../input/config';

/** 一个采样帧：只留校准要用的三个数。 */
export type Sample = { t: number; yaw: number; pitch: number };

export type StepId = 'neutral' | 'turnLeft' | 'turnRight' | 'nod';

/** 采样步的顺序；眨眼确认不在这四个里（它不产生数值）。 */
export const STEP_ORDER: readonly StepId[] = ['neutral', 'turnLeft', 'turnRight', 'nod'];

/** 进度条按「4 步采样 + 1 步眨眼确认」算。 */
export const STEP_COUNT = STEP_ORDER.length + 1;

// —— 采样窗口 ——
// lead 是「念完指令 + 人开始动」的时间，不喂缓冲；窗口才计数。
// 30fps 下 45 帧 ≈ 1.5 秒、30 帧 ≈ 1 秒（规格里「保持 1 秒」）。
export const NEUTRAL_LEAD_MS = 400;
export const NEUTRAL_WINDOW_FRAMES = 45;

export const TURN_LEAD_MS = 900;
export const TURN_WINDOW_FRAMES = 30;
/** 窗口里取幅度最大的若干帧再求中位数：过渡段和单帧野值都不该进最终值。 */
export const TURN_PEAK_K = 15;

export const NOD_LEAD_MS = 900;
/** 点头是动态动作，窗口拉长一点才容易抓到一次完整的下压。 */
export const NOD_WINDOW_FRAMES = 45;
export const NOD_PEAK_K = 15;

// —— 合格线 ——
/** 正对这一步要「定住」：yaw / pitch 在窗口内的极差超过它就重采。 */
export const NEUTRAL_MAX_SPREAD = 0.05;
/** 低于这个幅度当作没动。 */
export const MIN_TURN_MAGNITUDE = 0.012;
export const MIN_NOD_MAGNITUDE = 0.012;
/** 高于这个幅度当作跟踪抖跳（真人舒适峰值 yaw 0.40、pitch 0.19）。 */
export const MAX_PLAUSIBLE = 0.45;

// —— 眨眼确认 ——
export const CONFIRM_BLINK_COUNT = 2;
/** 两次眨眼算作两次，至少要隔这么远，否则是同一次闭合的抖动。 */
export const CONFIRM_BLINK_GAP_MS = 120;
/** 一次闭合至少要撑这么长，挡单帧噪声。 */
export const CONFIRM_BLINK_MIN_CLOSED_MS = 60;
/** 引用引擎已有的阈值，不新增配置键。 */
export const BLINK_TRIGGER = DEFAULT_CONFIG.blinkTrigger;
export const BLINK_RELEASE = DEFAULT_CONFIG.blinkRearm;

export type CaptureSpec = {
  leadMs: number;
  windowFrames: number;
  /** 求统计量时取窗口内幅度最大的前 k 帧；neutral 用整窗 mean，所以是 null。 */
  peakK: number | null;
};

export function captureFor(step: StepId | 'confirm'): CaptureSpec {
  switch (step) {
    case 'neutral':
      return { leadMs: NEUTRAL_LEAD_MS, windowFrames: NEUTRAL_WINDOW_FRAMES, peakK: null };
    case 'turnLeft':
    case 'turnRight':
      return { leadMs: TURN_LEAD_MS, windowFrames: TURN_WINDOW_FRAMES, peakK: TURN_PEAK_K };
    case 'nod':
      return { leadMs: NOD_LEAD_MS, windowFrames: NOD_WINDOW_FRAMES, peakK: NOD_PEAK_K };
    case 'confirm':
      return { leadMs: 0, windowFrames: 0, peakK: null };
  }
}

/** 四步采样攒出来的原始数值，还没钳位。 */
export type Measurements = {
  yawNeutral: number;
  pitchNeutral: number;
  leftOffset: number | null;
  rightOffset: number | null;
  /** 点头峰值，已经是绝对值 */
  nodPeakOffset: number | null;
};

export function initialMeasurements(): Measurements {
  return { yawNeutral: 0, pitchNeutral: 0, leftOffset: null, rightOffset: null, nodPeakOffset: null };
}

export type CopyKey = StepId | 'confirm' | 'retry' | 'giveUp';

export type StepCopy = { title: string; detail: string; hint: string; icon: string };

/** 文案集中放这儿：屏幕、语音、aria 都读同一份，不会出现念的和显示的不是一句话。 */
export const STEP_COPY: Record<CopyKey, StepCopy> = {
  neutral: {
    title: '第 1 步 · 正对屏幕',
    detail: '把脸放在取景框中间，自然看镜头，定住 1 秒半。',
    hint: '这一步记下你的中性位',
    icon: 'eye',
  },
  turnLeft: {
    title: '第 2 步 · 慢慢向左转头',
    detail: '转到舒服、还能看到屏幕边缘的最大幅度，停住 1 秒。',
    hint: '不用勉强，勉强了反而不准',
    icon: 'arrow-left',
  },
  turnRight: {
    title: '第 3 步 · 慢慢向右转头',
    detail: '同样转到舒服、还能看到屏幕边缘的最大幅度，停住 1 秒。',
    hint: '系统取两边里较小的那个，保证左右都走得到边缘',
    icon: 'arrow-right',
  },
  nod: {
    title: '第 4 步 · 点头',
    detail: '像说「对」那样点头，点到舒服、还能看到屏幕的幅度，重复两三次。',
    hint: '点头是确认动作，幅度小一点也没关系',
    icon: 'move-down',
  },
  confirm: {
    title: '第 5 步 · 眨眼两次确认',
    detail: '眨两次眼就完成校准。眨不动也没关系，按空格键同样算确认。',
    hint: '按空格可跳过眨眼',
    icon: 'scan-face',
  },
  retry: {
    title: '没感觉到，再来一次',
    detail: '刚才那一下没采到，跟着提示再做一遍，幅度不用变大。',
    hint: '这是自动重采，只多花 1 秒',
    icon: 'rotate-ccw',
  },
  giveUp: {
    title: '这一步没采到',
    detail: '可以重做这一步，也可以直接用默认量程继续——默认值也能玩，只是没那么贴身。',
    hint: '选「用默认值继续」不会保存任何数据',
    icon: 'handshake',
  },
};
