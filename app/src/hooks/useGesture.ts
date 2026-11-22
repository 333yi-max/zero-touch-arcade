import { useEffect, useRef, useState } from 'react';
import type { GestureConfig } from '../input/config';
import { GestureEngine } from '../input/gestureEngine';
import type { GestureEvent, InputSource, InputState, RawFrame } from '../input/types';

const NEUTRAL_STATE: InputState = { cursorX: 0, confirm: false, pause: false };

export interface GestureOutput {
  state: InputState;
  events: GestureEvent[];
  /** 最近一帧原始输入，调试面板用。 */
  frame: RawFrame | null;
  error: string | null;
}

/**
 * InputSource + GestureEngine 封成 hook。
 *
 * 镜像开关换的是引擎实例，不是输入源：换 mirrorX 时用旧量程建新引擎，
 * 摄像头不会因此重新申请权限。卸载时 stop()，StrictMode 双次挂载只留一个循环。
 */
export function useGesture(
  source: InputSource | null,
  mirrorX: GestureConfig['mirrorX'] = 1,
): GestureOutput {
  const engineRef = useRef<GestureEngine | null>(null);
  if (engineRef.current === null) engineRef.current = new GestureEngine({ mirrorX });

  const [state, setState] = useState<InputState>(NEUTRAL_STATE);
  const [events, setEvents] = useState<GestureEvent[]>([]);
  const [frame, setFrame] = useState<RawFrame | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const previous = engineRef.current;
    const engine = new GestureEngine({ mirrorX });
    if (previous) engine.setCalibration(previous.getCalibration());
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

  return { state, events, frame, error };
}
