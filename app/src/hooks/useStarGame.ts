import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import {
  createInitialState,
  multiplierFor,
  step,
  statsOf,
  type StarGameEvent,
  type StarGameState,
  type StarGameStats,
} from '../game/starGame';

/** 手势脉冲锁存：渲染间隔之间出现的点头/张嘴不丢，游戏循环消费后清零。 */
export interface StarGameInputLatch {
  cursorX: number;
  confirm: boolean;
  pause: boolean;
}

export interface StarGameHud {
  phase: StarGameState['phase'];
  score: number;
  lives: number;
  combo: number;
  multiplier: number;
  countdownRemaining: number;
  overCause: StarGameState['overCause'];
  stats: StarGameStats;
}

function hudOf(s: StarGameState): StarGameHud {
  return {
    phase: s.phase,
    score: s.score,
    lives: s.lives,
    combo: s.combo,
    multiplier: multiplierFor(s.combo),
    countdownRemaining: Math.ceil(s.countdownMs / 1000),
    overCause: s.overCause,
    stats: statsOf(s),
  };
}

function hudEquals(a: StarGameHud, b: StarGameHud): boolean {
  return (
    a.phase === b.phase &&
    a.score === b.score &&
    a.lives === b.lives &&
    a.combo === b.combo &&
    a.countdownRemaining === b.countdownRemaining
  );
}

/**
 * 游戏循环：RAF 里用真实 dt 推进纯逻辑，逻辑状态住在 ref 里不触发渲染。
 * React 只在分数/连击/相位变化时重渲染 —— 60fps 的挡板移动全部由画布自己画。
 */
export interface StarGameOptions {
  /** 演示模式的辅助瞄准：把原始 cursorX 换成辅助后的值（带积分的纯函数）。 */
  inputTransform?: (rawCursorX: number, state: StarGameState, timeMs: number) => number;
}

export function useStarGame(options: StarGameOptions = {}): {
  gameRef: RefObject<StarGameState>;
  latchRef: MutableRefObject<StarGameInputLatch>;
  hud: StarGameHud;
  events: StarGameEvent[];
  replay: () => void;
} {
  const gameRef = useRef<StarGameState>(createInitialState());
  const latchRef = useRef<StarGameInputLatch>({ cursorX: 0, confirm: false, pause: false });
  const hudRef = useRef<StarGameHud>(hudOf(gameRef.current));
  const [hud, setHud] = useState<StarGameHud>(hudRef.current);
  const [events, setEvents] = useState<StarGameEvent[]>([]);
  // transform 每次渲染都可能换，循环里永远取最新的
  const transformRef = useRef<StarGameOptions['inputTransform']>(options.inputTransform);
  transformRef.current = options.inputTransform;

  const replay = (): void => {
    gameRef.current = createInitialState();
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
      // 结束后的点头/眨眼 = 再玩一次。先记住脉冲，step 消费完再判断，
      // 这样重开后的同一帧不会被同一个脉冲立刻开局。
      const confirmBefore = latch.confirm;
      const transform = transformRef.current;
      const cursorX = transform ? transform(latch.cursorX, gameRef.current, now) : latch.cursorX;

      const { state, events: stepEvents } = step(
        gameRef.current,
        { cursorX, confirm: latch.confirm, pause: latch.pause },
        dt,
      );
      latch.confirm = false;
      latch.pause = false;
      gameRef.current = state;

      const next = hudOf(state);
      if (!hudEquals(hudRef.current, next)) {
        hudRef.current = next;
        setHud(next);
      }
      if (stepEvents.length > 0) setEvents(stepEvents);

      if (state.phase === 'over' && confirmBefore) {
        replay();
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { gameRef, latchRef, hud, events, replay };
}
