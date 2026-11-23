import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import { demoCandleInput, type DemoCandleMemory } from '../game/demoCandle';
import {
  createInitialState,
  statsOf,
  step,
  type CandleGameEvent,
  type CandleGameState,
  type CandleGameStats,
} from '../game/candleGame';

/** 手势锁存：confirm 是脉冲（点头），blow 是电平（张嘴持续）。吹蜡烛没有暂停键。 */
export interface CandleGameInputLatch {
  confirm: boolean;
  blow: boolean;
}

export interface CandleGameHud {
  phase: CandleGameState['phase'];
  score: number;
  extinguished: number;
  chained: number;
  countdownRemaining: number;
  overCause: CandleGameState['overCause'];
  stats: CandleGameStats;
}

function hudOf(s: CandleGameState): CandleGameHud {
  return {
    phase: s.phase,
    score: s.score,
    extinguished: s.extinguished,
    chained: s.chained,
    countdownRemaining: Math.ceil(s.countdownMs / 1000),
    overCause: s.overCause,
    stats: statsOf(s),
  };
}

function hudEquals(a: CandleGameHud, b: CandleGameHud): boolean {
  return (
    a.phase === b.phase &&
    a.score === b.score &&
    a.extinguished === b.extinguished &&
    a.chained === b.chained &&
    a.countdownRemaining === b.countdownRemaining
  );
}

export interface CandleGameOptions {
  /** 演示模式的虚拟玩家：整体接管输入（点头开局 + 节拍呼吸），不读手势锁存。 */
  demo?: boolean;
  /** 结束后点头 = 再玩一次。演示玩家不会自己点头，保持默认即可。 */
  replayOnConfirm?: boolean;
}

export function useCandleGame(options: CandleGameOptions = {}): {
  gameRef: RefObject<CandleGameState>;
  latchRef: MutableRefObject<CandleGameInputLatch>;
  hud: CandleGameHud;
  events: CandleGameEvent[];
  replay: () => void;
} {
  const gameRef = useRef<CandleGameState>(createInitialState());
  const latchRef = useRef<CandleGameInputLatch>({ confirm: false, blow: false });
  // 演示玩家从挂载时刻起算开场停顿；DEMO_CANDLE_START 的 -1e9 只给纯函数测试用
  const demoMemRef = useRef<DemoCandleMemory>({ pulsedAt: performance.now() });
  const hudRef = useRef<CandleGameHud>(hudOf(gameRef.current));
  const [hud, setHud] = useState<CandleGameHud>(hudRef.current);
  const [events, setEvents] = useState<CandleGameEvent[]>([]);
  const demoRef = useRef<boolean>(options.demo ?? false);
  demoRef.current = options.demo ?? false;
  const replayOnConfirmRef = useRef<boolean>(options.replayOnConfirm ?? true);
  replayOnConfirmRef.current = options.replayOnConfirm ?? true;

  const replay = (): void => {
    gameRef.current = createInitialState();
    demoMemRef.current = { pulsedAt: performance.now() };
    hudRef.current = hudOf(gameRef.current);
    setHud(hudRef.current);
  };

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const loop = (now: number): void => {
      const dt = now - last;
      last = now;
      const latch = latchRef.current;
      const confirmBefore = latch.confirm;

      let input: { confirm: boolean; blow: boolean };
      if (demoRef.current) {
        const out = demoCandleInput(demoMemRef.current, gameRef.current, now);
        demoMemRef.current = out.next;
        input = { confirm: out.confirm, blow: out.blow };
      } else {
        input = { confirm: latch.confirm, blow: latch.blow };
        latch.confirm = false;
      }

      const { state, events: stepEvents } = step(gameRef.current, input, dt);
      gameRef.current = state;

      const next = hudOf(state);
      if (!hudEquals(hudRef.current, next)) {
        hudRef.current = next;
        setHud(next);
      }
      if (stepEvents.length > 0) setEvents(stepEvents);

      if (state.phase === 'over' && confirmBefore && replayOnConfirmRef.current) {
        replay();
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { gameRef, latchRef, hud, events, replay };
}
