import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import { demoWhackInput, type DemoWhackMemory } from '../game/demoWhack';
import {
  createInitialState,
  multiplierFor,
  step,
  statsOf,
  type WhackGameEvent,
  type WhackGameState,
  type WhackGameStats,
} from '../game/whackGame';

/** 手势脉冲锁存：渲染间隔之间出现的点头/张嘴不丢，游戏循环消费后清零。 */
export interface WhackGameInputLatch {
  cursorX: number;
  confirm: boolean;
  pause: boolean;
}

export interface WhackGameHud {
  phase: WhackGameState['phase'];
  score: number;
  hits: number;
  misses: number;
  combo: number;
  multiplier: number;
  countdownRemaining: number;
  overCause: WhackGameState['overCause'];
  stats: WhackGameStats;
}

function hudOf(s: WhackGameState): WhackGameHud {
  return {
    phase: s.phase,
    score: s.score,
    hits: s.hits,
    misses: s.misses,
    combo: s.combo,
    multiplier: multiplierFor(s.combo),
    countdownRemaining: Math.ceil(s.countdownMs / 1000),
    overCause: s.overCause,
    stats: statsOf(s),
  };
}

function hudEquals(a: WhackGameHud, b: WhackGameHud): boolean {
  return (
    a.phase === b.phase &&
    a.score === b.score &&
    a.hits === b.hits &&
    a.misses === b.misses &&
    a.combo === b.combo &&
    a.countdownRemaining === b.countdownRemaining
  );
}

export interface WhackGameOptions {
  /** 演示模式的虚拟玩家：整体接管输入（瞄准+点头），不读手势锁存。 */
  demo?: boolean;
  /** 结束后点头/眨眼 = 再玩一次。演示模式的虚拟玩家不会自己点头，可以保持默认。 */
  replayOnConfirm?: boolean;
}

export function useWhackGame(options: WhackGameOptions = {}): {
  gameRef: RefObject<WhackGameState>;
  latchRef: MutableRefObject<WhackGameInputLatch>;
  hud: WhackGameHud;
  events: WhackGameEvent[];
  replay: () => void;
} {
  const gameRef = useRef<WhackGameState>(createInitialState());
  const latchRef = useRef<WhackGameInputLatch>({ cursorX: 0, confirm: false, pause: false });
  // 演示玩家从挂载时刻起算开场停顿；DEMO_WHACK_START 的 -1e9 只给纯函数测试用
  const demoMemRef = useRef<DemoWhackMemory>({ cursorX: 0, pulsedAt: performance.now() });
  const hudRef = useRef<WhackGameHud>(hudOf(gameRef.current));
  const [hud, setHud] = useState<WhackGameHud>(hudRef.current);
  const [events, setEvents] = useState<WhackGameEvent[]>([]);
  const demoRef = useRef<boolean>(options.demo ?? false);
  demoRef.current = options.demo ?? false;
  const replayOnConfirmRef = useRef<boolean>(options.replayOnConfirm ?? true);
  replayOnConfirmRef.current = options.replayOnConfirm ?? true;

  const replay = (): void => {
    gameRef.current = createInitialState();
    demoMemRef.current = { cursorX: 0, pulsedAt: performance.now() };
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

      let input: { cursorX: number; confirm: boolean; pause: boolean };
      if (demoRef.current) {
        const out = demoWhackInput(demoMemRef.current, gameRef.current, now);
        demoMemRef.current = out.next;
        input = { cursorX: out.cursorX, confirm: out.confirm, pause: out.pause };
      } else {
        input = { cursorX: latch.cursorX, confirm: latch.confirm, pause: latch.pause };
        latch.confirm = false;
        latch.pause = false;
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
