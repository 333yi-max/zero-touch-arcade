export type RawFrame = {
  t: number;
  yaw: number;
  pitch: number;
  blinkL: number;
  blinkR: number;
  jaw: number;
  present: boolean;
};

export type GestureEvent = 'confirm' | 'pause';

export type InputState = {
  cursorX: number;
  confirm: boolean;
  pause: boolean;
};

export type Calibration = {
  yawNeutral: number;
  pitchNeutral: number;
  /** 左右转头的量程：光标走到屏幕边缘所需的 |dyaw| */
  range: number;
  /**
   * 点头的量程：触发 confirm 所需的 |dpitch|。缺省等于 range。
   * 可选是刻意的 —— 旧的三字段字面量和 localStorage 老记录都要能喂进来。
   */
  pitchRange?: number;
};

export type UpdateResult = {
  state: InputState;
  events: GestureEvent[];
};

export interface InputSource {
  start(): Promise<void>;
  stop(): void;
  onFrame(cb: (f: RawFrame) => void): void;
}
