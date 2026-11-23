import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import {
  BEATS,
  createInitialState,
  step,
  statsOf,
  type RhythmGameEvent,
  type RhythmGameInput,
  type RhythmGameState,
  type RhythmGameStats,
} from '../game/rhythmGame';

/** 手势脉冲锁存：渲染间隔之间出现的点头不丢，游戏循环消费后清零。 */
export interface RhythmGameInputLatch {
  confirm: boolean;
}

export interface RhythmGameHud {
  phase: RhythmGameState['phase'];
  score: number;
  combo: number;
  judged: number;
  total: number;
  countdownRemaining: number;
  stats: RhythmGameStats;
}

function hudOf(s: RhythmGameState): RhythmGameHud {
  return {
    phase: s.phase,
    score: s.score,
    combo: s.combo,
    judged: s.results.length,
    total: BEATS,
    countdownRemaining: Math.ceil(s.countdownMs / 1000),
    stats: statsOf(s),
  };
}

function hudEquals(a: RhythmGameHud, b: RhythmGameHud): boolean {
  return (
    a.phase === b.phase &&
    a.score === b.score &&
    a.combo === b.combo &&
    a.judged === b.judged &&
    a.countdownRemaining === b.countdownRemaining
  );
}

export interface RhythmGameOptions {
  /** 演示模式的自动打拍：把原始输入换成按节拍生成的 confirm（纯函数）。 */
  inputTransform?: (
    raw: RhythmGameInput,
    state: RhythmGameState,
    timeMs: number,
  ) => RhythmGameInput;
  /** 结束后点头 = 再玩一次。演示模式的虚拟玩家会一直点头，所以要能关掉。 */
  replayOnConfirm?: boolean;
}

export function useRhythmGame(options: RhythmGameOptions = {}): {
  gameRef: RefObject<RhythmGameState>;
  latchRef: MutableRefObject<RhythmGameInputLatch>;
  hud: RhythmGameHud;
  events: RhythmGameEvent[];
  replay: () => void;
} {
  const gameRef = useRef<RhythmGameState>(createInitialState());
  const latchRef = useRef<RhythmGameInputLatch>({ confirm: false });
  const hudRef = useRef<RhythmGameHud>(hudOf(gameRef.current));
  const [hud, setHud] = useState<RhythmGameHud>(hudRef.current);
  const [events, setEvents] = useState<RhythmGameEvent[]>([]);
  // transform 每次渲染都可能换，循环里永远取最新的
  const transformRef = useRef<RhythmGameOptions['inputTransform']>(options.inputTransform);
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
      // 结束后的点头 = 再玩一次。先记住脉冲，step 消费完再判断，
      // 这样重开后的同一帧不会被同一个脉冲立刻开局。
      const confirmBefore = latch.confirm;
      const transform = transformRef.current;
      const input = transform
        ? transform({ confirm: latch.confirm }, gameRef.current, now)
        : { confirm: latch.confirm };

      const { state, events: stepEvents } = step(gameRef.current, input, dt);
      latch.confirm = false;
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
