import { useEffect, useRef, useState } from 'react';
import { GestureEngine } from '../input/gestureEngine';
import type { GestureEvent, InputSource, InputState } from '../input/types';

const NEUTRAL_STATE: InputState = { cursorX: 0, confirm: false, pause: false };

/**
 * 把 InputSource 的帧流接到 GestureEngine 上。
 * 引擎实例挂在 ref 上，StrictMode 的双次挂载只会重建一次订阅，不会留下两个 RAF 循环。
 */
export function useGesture(source: InputSource): { state: InputState; events: GestureEvent[] } {
  const engineRef = useRef<GestureEngine | null>(null);
  const [state, setState] = useState<InputState>(NEUTRAL_STATE);
  const [events, setEvents] = useState<GestureEvent[]>([]);

  useEffect(() => {
    if (engineRef.current === null) engineRef.current = new GestureEngine();
    const engine = engineRef.current;

    let active = true;
    source.onFrame((frame) => {
      if (!active) return;
      const result = engine.update(frame);
      setState(result.state);
      setEvents(result.events);
    });

    void source.start();

    return () => {
      active = false;
      source.stop();
    };
  }, [source]);

  return { state, events };
}
