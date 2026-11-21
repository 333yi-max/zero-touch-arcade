import type { InputSource, RawFrame } from './types';

const YAW_AMPLITUDE = 0.16;
const YAW_TIME_CONSTANT = 1400;
const NOD_PERIOD_MS = 3000;
const NOD_PITCH = 0.14;
const NOD_DURATION_MS = 300;
const BLINK_PERIOD_MS = 4000;
const BLINK_AMOUNT = 1;
const BLINK_DURATION_MS = 200;

/**
 * 虚拟玩家：不接摄像头，用 requestAnimationFrame 产出确定性的 RawFrame，
 * 让演示模式在没有 MediaPipe 的情况下也能跑通整条输入链路。
 */
export class ScriptedSource implements InputSource {
  private frameCb: ((f: RawFrame) => void) | null = null;
  private rafId: number | null = null;
  private startedAt: number | null = null;

  async start(): Promise<void> {
    if (this.rafId !== null) return;
    this.startedAt = null;

    const tick = (ts: number) => {
      if (this.startedAt === null) this.startedAt = ts;
      this.frameCb?.(ScriptedSource.frameAt(ts - this.startedAt));
      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.startedAt = null;
  }

  onFrame(cb: (f: RawFrame) => void): void {
    this.frameCb = cb;
  }

  /** t 为相对启动时刻的毫秒数，同一 t 永远得到同一帧。 */
  static frameAt(t: number): RawFrame {
    const nodding = t % NOD_PERIOD_MS < NOD_DURATION_MS;
    const blinking = t % BLINK_PERIOD_MS < BLINK_DURATION_MS;

    return {
      t,
      yaw: YAW_AMPLITUDE * Math.sin(t / YAW_TIME_CONSTANT),
      pitch: nodding ? NOD_PITCH : 0,
      blinkL: blinking ? BLINK_AMOUNT : 0,
      blinkR: blinking ? BLINK_AMOUNT : 0,
      jaw: 0,
      present: true,
    };
  }
}
