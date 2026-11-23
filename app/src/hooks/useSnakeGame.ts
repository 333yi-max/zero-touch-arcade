import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import {
  createInitialState,
  multiplierFor,
  step,
  statsOf,
  type SnakeGameEvent,
  type SnakeGameState,
  type SnakeGameStats,
} from '../game/snakeGame';

/** 手势脉冲锁存：渲染间隔之间出现的点头/张嘴不丢，游戏循环消费后清零。 */
export interface SnakeGameInputLatch {
  cursorX: number;
  confirm: boolean;
  pause: boolean;
}

export interface SnakeGameHud {
  phase: SnakeGameState['phase'];
  score: number;
  combo: number;
  multiplier: number;
  boostActive: boolean;
  length: number;
  countdownRemaining: number;
  /** 剩余秒数（计时局，向上取整）。 */
  timeLeft: number;
  stats: SnakeGameStats;
}

function hudOf(s: SnakeGameState): SnakeGameHud {
  return {
    phase: s.phase,
    score: s.score,
    combo: s.combo,
    multiplier: multiplierFor(s.combo),
    boostActive: s.boostMs > 0,
    length: s.segments.length,
    countdownRemaining: Math.ceil(s.countdownMs / 1000),
    timeLeft: Math.ceil(Math.max(0, s.durationMs - s.elapsedMs) / 1000),
    stats: statsOf(s),
  };
}

function hudEquals(a: SnakeGameHud, b: SnakeGameHud): boolean {
  return (
    a.phase === b.phase &&
    a.score === b.score &&
    a.combo === b.combo &&
    a.boostActive === b.boostActive &&
    a.length === b.length &&
    a.countdownRemaining === b.countdownRemaining &&
    a.timeLeft === b.timeLeft
  );
}

export interface SnakeGameOptions {
  /** 演示模式的辅助瞄准：把原始 cursorX 换成辅助后的值（带积分的纯函数）。 */
  inputTransform?: (rawCursorX: number, state: SnakeGameState, timeMs: number) => number;
  /** 结束后点头/眨眼 = 再玩一次。演示模式的虚拟玩家会一直点头，所以要能关掉。 */
  replayOnConfirm?: boolean;
}

export function useSnakeGame(options: SnakeGameOptions = {}): {
  gameRef: RefObject<SnakeGameState>;
  latchRef: MutableRefObject<SnakeGameInputLatch>;
  hud: SnakeGameHud;
  events: SnakeGameEvent[];
  replay: () => void;
} {
  const gameRef = useRef<SnakeGameState>(createInitialState());
  const latchRef = useRef<SnakeGameInputLatch>({ cursorX: 0, confirm: false, pause: false });
  const hudRef = useRef<SnakeGameHud>(hudOf(gameRef.current));
  const [hud, setHud] = useState<SnakeGameHud>(hudRef.current);
  const [events, setEvents] = useState<SnakeGameEvent[]>([]);
  // transform 每次渲染都可能换，循环里永远取最新的
  const transformRef = useRef<SnakeGameOptions['inputTransform']>(options.inputTransform);
  transformRef.current = options.inputTransform;
  const replayOnConfirmRef = useRef<boolean>(options.replayOnConfirm ?? true);
  replayOnConfirmRef.current = options.replayOnConfirm ?? true;

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
