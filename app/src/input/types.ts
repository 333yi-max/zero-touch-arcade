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
  range: number;
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
