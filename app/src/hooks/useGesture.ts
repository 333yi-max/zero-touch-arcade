import { useEffect, useRef, useState } from 'react';
import type { GestureConfig } from '../input/config';
import { GestureEngine } from '../input/gestureEngine';
import type { Calibration, GestureEvent, InputSource, InputState, RawFrame } from '../input/types';

const NEUTRAL_STATE: InputState = { cursorX: 0, confirm: false, pause: false };

export interface GestureOutput {
  state: InputState;
  events: GestureEvent[];
  /** 最近一帧原始输入，调试面板用。 */
  frame: RawFrame | null;
  error: string | null;
  /** 当前生效的量程与中性位，调试面板只读显示用。 */
  calibration: Required<Calibration>;
}

/**
 * InputSource + GestureEngine 封成 hook。
 *
 * 镜像开关换的是引擎实例，不是输入源：换 mirrorX 时用旧量程建新引擎，
 * 摄像头不会因此重新申请权限。卸载时 stop()，StrictMode 双次挂载只留一个循环。
 *
 * calibration 是**构造种子**而不是 effect 覆写：它只在建引擎那一刻读一次，
 * 所以不进任何依赖数组 —— 校准值变了不该重建引擎（那会重开摄像头）。
 */
export function useGesture(
  source: InputSource | null,
  mirrorX: GestureConfig['mirrorX'] = 1,
  calibration?: Calibration | null,
): GestureOutput {
  const engineRef = useRef<GestureEngine | null>(null);
  if (engineRef.current === null) engineRef.current = new GestureEngine({ mirrorX });

  const calibrationRef = useRef<Calibration | null>(calibration ?? null);
  const [state, setState] = useState<InputState>(NEUTRAL_STATE);
  const [events, setEvents] = useState<GestureEvent[]>([]);
  const [frame, setFrame] = useState<RawFrame | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 声明顺序要紧：这个 effect 必须排在换镜像的 effect 前面，
  // 挂载时换镜像的 effect 会立刻重建引擎并读这个 ref。
  useEffect(() => {
    calibrationRef.current = calibration ?? null;
  }, [calibration]);

  useEffect(() => {
    const engine = new GestureEngine({ mirrorX });
    // 换镜像时保住量程：优先用传进来的校准值，否则沿用当前引擎的
    const seed = calibrationRef.current ?? engineRef.current?.getCalibration();
    if (seed) engine.setCalibration(seed);
    engineRef.current = engine;
  }, [mirrorX]);

  useEffect(() => {
    if (!source) return;
    setError(null);

    let active = true;
    source.onFrame((raw) => {
      if (!active) return;
      const engine = engineRef.current;
      if (!engine) return;
      const result = engine.update(raw);
      setFrame(raw);
      setState(result.state);
      setEvents(result.events);
    });
    source.start().catch((reason: unknown) => {
      if (!active) return;
      setError(reason instanceof Error ? reason.message : String(reason));
    });

    return () => {
      active = false;
      source.stop();
    };
  }, [source]);

  return {
    state,
    events,
    frame,
    error,
    calibration: engineRef.current.getCalibration(),
  };
}
