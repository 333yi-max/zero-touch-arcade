export type GestureConfig = {
  emaAlpha: number;
  deadzone: number;
  rangeMin: number;
  rangeMax: number;
  pitchRangeMin: number;
  pitchRangeMax: number;
  nodTriggerRatio: number;
  nodRearmRatio: number;
  nodHoldMs: number;
  nodCooldownMs: number;
  blinkTrigger: number;
  blinkRearm: number;
  blinkHoldMs: number;
  blinkCooldownMs: number;
  jawTrigger: number;
  jawRearm: number;
  jawHoldMs: number;
  jawCooldownMs: number;
  mirrorX: 1 | -1;
};

export const DEFAULT_CONFIG: GestureConfig = {
  // 平滑：越小越稳，越大越跟手
  emaAlpha: 0.35,
  // 光标死区
  deadzone: 0.05,
  // 自适应量程的上下限（左右转头）
  rangeMin: 0.08,
  rangeMax: 0.22,
  // 点头量程独立：真人 yaw 舒适峰值 0.36~0.40，pitch 只有 0.19，共用一份必然顾此失彼
  pitchRangeMin: 0.06,
  pitchRangeMax: 0.18,
  // 点头：达到量程的 55% 触发，回落到 25% 才重新武装
  nodTriggerRatio: 0.55,
  nodRearmRatio: 0.25,
  nodHoldMs: 220,
  nodCooldownMs: 500,
  // 眨眼：双眼同时超过 0.55，保持 180ms；冷却 700ms
  blinkTrigger: 0.55,
  blinkRearm: 0.25,
  blinkHoldMs: 180,
  blinkCooldownMs: 700,
  // 张嘴：超过 0.5，保持 350ms；冷却 1200ms
  jawTrigger: 0.5,
  jawRearm: 0.3,
  jawHoldMs: 350,
  jawCooldownMs: 1200,
  // 预览镜像时设为 -1，保证“向左转头，光标向左”
  mirrorX: 1,
};

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
