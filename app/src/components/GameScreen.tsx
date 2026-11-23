import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { RefObject } from 'react';
import { useDebugTrace } from '../hooks/useDebugTrace';
import { useGesture } from '../hooks/useGesture';
import { useRhythmGame } from '../hooks/useRhythmGame';
import type { RhythmGameHud } from '../hooks/useRhythmGame';
import { useStarGame } from '../hooks/useStarGame';
import type { StarGameHud } from '../hooks/useStarGame';
import { useSnakeGame } from '../hooks/useSnakeGame';
import type { SnakeGameHud } from '../hooks/useSnakeGame';
import { useWhackGame } from '../hooks/useWhackGame';
import type { WhackGameHud } from '../hooks/useWhackGame';
import { useCandleGame } from '../hooks/useCandleGame';
import type { CandleGameHud } from '../hooks/useCandleGame';
import { CameraSource } from '../input/cameraSource';
import type { Calibration, GestureEvent, InputState, RawFrame } from '../input/types';
import { ScriptedSource } from '../input/scriptedSource';
import { demoAimCursor } from '../game/demoAim';
import { demoRhythmInput } from '../game/demoRhythm';
import { demoSnakeTurn } from '../game/demoSnake';
import { createGameSpeaker } from '../game/gameSpeech';
import type { GameSpeaker } from '../game/gameSpeech';
import { readMuted, writeMuted } from '../game/playerPrefs';
import { createGameSounds } from '../game/sound';
import type { GameSounds } from '../game/sound';
import type { JudgeResult } from '../game/rhythmGame';
import type { GameId, Mode } from '../state/machine';
import Button from './Button';
import CameraStage, { CameraProblemCard } from './CameraStage';
import DebugPanel from './DebugPanel';
import ResultCard from './ResultCard';
import RhythmGame from './RhythmGame';
import type { RhythmFx } from './RhythmGame';
import StarGame from './StarGame';
import type { GameFx } from './StarGame';
import SnakeGame from './SnakeGame';
import type { SnakeFx } from './SnakeGame';
import WhackGame from './WhackGame';
import type { WhackFx } from './WhackGame';
import CandleGame, { candleFlamePos } from './CandleGame';
import type { CandleFx } from './CandleGame';
import { START_LIVES } from '../game/starGame';
import { BOOST_MS } from '../game/snakeGame';
import { HOLE_POSITIONS, MAX_MISSES, TARGET_HITS, whackPathPoint } from '../game/whackGame';
import { CANDLE_COUNT } from '../game/candleGame';
import {
  CountdownAnnouncer,
  HudActions,
  HudBadge,
  HudContainer,
  HudField,
  HudLives,
  HudScore,
  HudStat,
} from './gameHud';
import TopBar from './TopBar';
import { Info, Lightbulb, PlayCircle, Sparkles, Video } from 'lucide-react';

interface GameScreenProps {
  gameId: GameId;
  mode: Mode;
  /** 校准值只在摄像头模式下生效；演示模式恒用引擎默认量程。 */
  calibration?: Required<Calibration> | null;
  onBack: () => void;
  onDemo: () => void;
  onSwitchGame: () => void;
}

const EVENT_LOG_SIZE = 8;

export default function GameScreen({
  gameId,
  mode,
  calibration,
  onBack,
  onDemo,
  onSwitchGame,
}: GameScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scriptedRef = useRef<ScriptedSource | null>(null);

  const [cameraSource, setCameraSource] = useState<CameraSource | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [mirrorX, setMirrorX] = useState<1 | -1>(-1);
  const [overlay, setOverlay] = useState(true);
  const [debugOpen, setDebugOpen] = useState(false);
  const [eventLog, setEventLog] = useState<{ type: GestureEvent; at: number }[]>([]);

  useEffect(() => {
    if (mode !== 'camera') return;
    const video = videoRef.current;
    if (!video) return;
    const source = new CameraSource(video, (error) => setResumeError(error.message));
    setCameraSource(source);
    return () => {
      setCameraSource(null);
      source.dispose();
    };
  }, [mode]);

  if (mode === 'demo' && scriptedRef.current === null) {
    scriptedRef.current = new ScriptedSource();
  }

  const gesture = useGesture(
    mode === 'demo' ? scriptedRef.current : cameraSource,
    mirrorX,
    // 虚拟玩家不能继承真人的量程，所以演示模式恒传 null
    mode === 'camera' ? (calibration ?? null) : null,
  );
  const { state, events, frame, error } = gesture;

  useEffect(() => {
    if (events.length === 0) return;
    setEventLog((log) =>
      [...events.map((type) => ({ type, at: Date.now() })), ...log].slice(0, EVENT_LOG_SIZE),
    );
  }, [events]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.toLowerCase() !== 'd') return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      event.preventDefault();
      setDebugOpen((open) => !open);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const problem = error ?? resumeError;
  const trace = useDebugTrace(frame, state.cursorX, events);

  const camera = {
    videoRef,
    source: cameraSource,
    mirrored: mirrorX === -1,
    overlay,
    onDemo,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <TopBar
        title={
          gameId === 'star'
            ? '接星星'
            : gameId === 'rhythm'
              ? '节奏点头'
              : gameId === 'snake'
                ? '霓虹贪吃蛇'
                : gameId === 'whack'
                  ? '打地鼠'
                  : '吹蜡烛'
        }
        onBack={onBack}
        right={
          <span className="card-surface inline-flex items-center gap-2 rounded-full border-2 border-edge px-4 py-2 text-base font-bold text-dim">
            {mode === 'demo' ? (
              <PlayCircle size={18} aria-hidden="true" />
            ) : (
              <Video size={18} aria-hidden="true" />
            )}
            {mode === 'demo' ? '演示模式' : '摄像头'}
          </span>
        }
      />

      {mode === 'demo' ? (
        <p className="card-surface flex items-center gap-2 rounded-card px-5 py-3 text-lg text-dim">
          <Info size={20} aria-hidden="true" className="shrink-0 text-ring" />
          虚拟玩家演示，开启摄像头即可亲自体验。
        </p>
      ) : null}

      {problem ? (
        <CameraProblemCard message={problem} onDemo={onDemo} />
      ) : gameId === 'star' ? (
        <StarSession
          mode={mode}
          gestureState={state}
          gestureEvents={events}
          frame={frame}
          camera={camera}
          onBack={onBack}
          onSwitchGame={onSwitchGame}
        />
      ) : gameId === 'rhythm' ? (
        <RhythmSession
          mode={mode}
          gestureState={state}
          gestureEvents={events}
          frame={frame}
          camera={camera}
          onBack={onBack}
          onSwitchGame={onSwitchGame}
        />
      ) : gameId === 'whack' ? (
        <WhackSession
          mode={mode}
          gestureState={state}
          gestureEvents={events}
          frame={frame}
          camera={camera}
          onBack={onBack}
          onSwitchGame={onSwitchGame}
        />
      ) : gameId === 'candle' ? (
        <CandleSession
          mode={mode}
          gestureState={state}
          gestureEvents={events}
          frame={frame}
          camera={camera}
          onBack={onBack}
          onSwitchGame={onSwitchGame}
        />
      ) : (
        <SnakeSession
          mode={mode}
          gestureState={state}
          gestureEvents={events}
          frame={frame}
          camera={camera}
          onBack={onBack}
          onSwitchGame={onSwitchGame}
        />
      )}

      <p className="text-base text-dim">按 D 打开调试面板</p>

      {debugOpen ? (
        <DebugPanel
          frame={frame}
          state={state}
          eventLog={eventLog}
          mirrorX={mirrorX}
          onMirrorXChange={setMirrorX}
          overlay={overlay}
          onOverlayChange={setOverlay}
          delegate={cameraSource?.delegate ?? null}
          calibration={gesture.calibration}
          peaks={trace.peaks}
          rows={trace.rows}
          onResetPeaks={trace.resetPeaks}
          onExportCsv={trace.exportCsv}
          onClose={() => setDebugOpen(false)}
        />
      ) : null}
    </div>
  );
}

// ———— 五个游戏的会话组件：各自持有自己的纯逻辑 hook、音效与覆盖层 ————

interface SessionProps {
  mode: Mode;
  gestureState: InputState;
  gestureEvents: GestureEvent[];
  frame: RawFrame | null;
  camera: {
    videoRef: RefObject<HTMLVideoElement>;
    source: CameraSource | null;
    mirrored: boolean;
    overlay: boolean;
    onDemo: () => void;
  };
  onBack: () => void;
  onSwitchGame: () => void;
}

function StarSession({
  mode,
  gestureState,
  gestureEvents,
  frame,
  camera,
  onBack,
  onSwitchGame,
}: SessionProps) {
  // 演示模式的辅助瞄准：把真实 cursorX 换成慢慢逼近最近星星的值。
  // 积分器住在 aimRef 里逐帧回传；摄像头模式完全不经过这条路。
  const aimRef = useRef(0);
  const { gameRef, latchRef, hud, events: gameEvents, replay } = useStarGame({
    inputTransform:
      mode === 'demo'
        ? (_raw, state, timeMs) => {
            const out = demoAimCursor({ prev: aimRef.current, state, timeMs });
            aimRef.current = out.next;
            return out.cursorX;
          }
        : undefined,
    // 演示模式的虚拟玩家每 3 秒点一次头，结束后别让它自动再玩，结果卡才看得完
    replayOnConfirm: mode === 'camera',
  });

  const soundsRef = useRef<GameSounds | null>(null);
  const speakerRef = useRef<GameSpeaker | null>(null);
  const fxRef = useRef<GameFx>({
    catchUntil: 0,
    catchAt: null,
    missUntil: 0,
    shakeUntil: 0,
    shakePower: 0,
    texts: [],
  });
  const prevPhaseRef = useRef<StarGameHud['phase']>('ready');
  const [muted, setMuted] = useState<boolean>(() => readMuted());

  useEffect(() => {
    const sounds = createGameSounds();
    const speaker = createGameSpeaker();
    sounds.setMuted(readMuted());
    soundsRef.current = sounds;
    speakerRef.current = speaker;
    return () => {
      soundsRef.current = null;
      speakerRef.current = null;
      sounds.dispose();
    };
  }, []);

  // 手势脉冲锁存：点头/张嘴只持续一帧，渲染间隔之间出现也不丢
  const latch = latchRef.current;
  latch.cursorX = gestureState.cursorX;
  if (gestureState.confirm || gestureEvents.includes('confirm')) latch.confirm = true;
  if (gestureState.pause || gestureEvents.includes('pause')) latch.pause = true;

  // 事件 → 声音 + 视觉特效：每个音效都有画面替身，听障用户不靠声音
  useEffect(() => {
    if (gameEvents.length === 0) return;
    const sounds = soundsRef.current;
    const fx = fxRef.current;
    const now = performance.now();
    for (const e of gameEvents) {
      switch (e.type) {
        case 'catch':
          sounds?.catchSound(e.multiplier);
          fx.catchUntil = now + 300;
          fx.catchAt = { x: e.x, y: e.y };
          fx.texts = [
            ...fx.texts.slice(-5),
            {
              x: e.x,
              y: e.y - 24,
              text: e.multiplier > 1 ? `+${e.base * e.multiplier} ×${e.multiplier}` : `+${e.base}`,
              color: e.gold ? '#ffe566' : '#ffd60a',
              until: now + 900,
            },
          ];
          if (e.gold) {
            fx.shakeUntil = now + 220;
            fx.shakePower = 0.35;
          }
          break;
        case 'miss':
          sounds?.missSound();
          fx.missUntil = now + 350;
          fx.shakeUntil = now + 320;
          fx.shakePower = 0.85;
          break;
        case 'countdown':
          if (e.remaining === 3) sounds?.startSound();
          break;
        case 'gameOver':
          sounds?.endSound();
          break;
      }
    }
  }, [gameEvents]);

  // 语音只报相位切换，不逐帧叫
  useEffect(() => {
    const speaker = speakerRef.current;
    if (!speaker) return;
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = hud.phase;
    if (hud.phase === prev) return;
    if (hud.phase === 'countdown') speaker.countdown();
    else if (hud.phase === 'paused') speaker.paused();
    else if (hud.phase === 'playing' && prev === 'paused') speaker.resumed();
    else if (hud.phase === 'over') speaker.gameOver(hud.overCause ?? 'lives', hud.score);
  }, [hud.phase, hud.score, hud.overCause]);

  // 游戏中 confirm 不响应用户操作，音效也只在开始前/结束后给反馈
  useEffect(() => {
    if (gestureEvents.includes('confirm') && (hud.phase === 'ready' || hud.phase === 'over')) {
      soundsRef.current?.confirmSound(frame);
    }
  }, [gestureEvents, frame, hud.phase]);

  // 光标跟随音：越靠边音量越高；暂停/结束/摄像头不可用时静音
  const trackingActive = hud.phase !== 'paused' && hud.phase !== 'over';
  useEffect(() => {
    soundsRef.current?.setTracking(gestureState.cursorX, trackingActive);
  }, [gestureState.cursorX, trackingActive]);

  const toggleMuted = (): void => {
    const next = !muted;
    setMuted(next);
    writeMuted(next);
    soundsRef.current?.setMuted(next);
  };

  const gamePaused = hud.phase === 'paused';

  // 准备中要明确告诉用户「怎么开始」：点头/眨眼，或点按钮（陪护者也能点）。
  // 结束后复用同一层显示统一结果卡。
  const overlayNode =
    hud.phase === 'over' && hud.overCause ? (
      <ResultCard
        result={{ game: 'star', stats: hud.stats }}
        onReplay={replay}
        onSwitchGame={onSwitchGame}
        onHome={onBack}
      />
    ) : hud.phase === 'ready' ? (
      <ReadyCard onStart={() => (latch.confirm = true)} />
    ) : null;

  return (
    <SessionLayout
      showCamera={mode === 'camera'}
      camera={camera}
      cameraPaused={gamePaused}
      frame={frame}
      hud={
        <StarHudBar
          hud={hud}
          muted={muted}
          onMuteToggle={toggleMuted}
          onPauseToggle={() => (latchRef.current.pause = true)}
        />
      }
      tips={GAME_TIPS.star}
    >
      <StarGame
        gameRef={gameRef}
        paused={gamePaused}
        fxRef={fxRef}
        overlay={overlayNode}
        frameClass={
          mode === 'camera' ? 'max-h-[36vh] xl:max-h-[80vh]' : 'max-h-[60vh] xl:max-h-[80vh]'
        }
      />
    </SessionLayout>
  );
}

function RhythmSession({
  mode,
  gestureState,
  gestureEvents,
  frame,
  camera,
  onBack,
  onSwitchGame,
}: SessionProps) {
  // 演示模式的虚拟打拍：真实手势完全忽略，按节拍注入 confirm
  const { gameRef, latchRef, hud, events: gameEvents, replay } = useRhythmGame({
    inputTransform: mode === 'demo' ? demoRhythmInput : undefined,
    replayOnConfirm: mode === 'camera',
  });

  const soundsRef = useRef<GameSounds | null>(null);
  const speakerRef = useRef<GameSpeaker | null>(null);
  const fxRef = useRef<RhythmFx>({
    judgeUntil: 0,
    judge: null,
    beatUntil: 0,
    shakeUntil: 0,
    shakePower: 0,
    texts: [],
  });
  const prevPhaseRef = useRef<RhythmGameHud['phase']>('ready');
  const [muted, setMuted] = useState<boolean>(() => readMuted());
  const [lastJudge, setLastJudge] = useState<JudgeResult | null>(null);

  useEffect(() => {
    const sounds = createGameSounds();
    const speaker = createGameSpeaker();
    sounds.setMuted(readMuted());
    soundsRef.current = sounds;
    speakerRef.current = speaker;
    return () => {
      soundsRef.current = null;
      speakerRef.current = null;
      sounds.dispose();
    };
  }, []);

  const latch = latchRef.current;
  if (gestureState.confirm || gestureEvents.includes('confirm')) latch.confirm = true;

  // 事件 → 声音 + 视觉特效
  useEffect(() => {
    if (gameEvents.length === 0) return;
    const sounds = soundsRef.current;
    const fx = fxRef.current;
    const now = performance.now();
    for (const e of gameEvents) {
      switch (e.type) {
        case 'beat':
          sounds?.beatSound();
          fx.beatUntil = now + 300;
          break;
        case 'judge':
          sounds?.judgeSound(e.result);
          fx.judgeUntil = now + 500;
          fx.judge = { result: e.result, beat: e.beat };
          setLastJudge(e.result);
          if (e.result === 'miss') {
            fx.shakeUntil = now + 300;
            fx.shakePower = 0.7;
          } else {
            fx.texts = [
              ...fx.texts.slice(-5),
              {
                x: 400,
                y: 300 - 70 - 60,
                text: e.result === 'perfect' ? `+100 连击 ${e.combo}` : '+60',
                color: e.result === 'perfect' ? '#ffd60a' : '#58c4ff',
                until: now + 800,
              },
            ];
          }
          break;
        case 'countdown':
          if (e.remaining === 3) sounds?.startSound();
          break;
        case 'gameOver':
          sounds?.ratingSound(e.stats.rating);
          break;
      }
    }
  }, [gameEvents]);

  // 语音只报相位切换：开场报玩法，结束报评级
  useEffect(() => {
    const speaker = speakerRef.current;
    if (!speaker) return;
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = hud.phase;
    if (hud.phase === prev) return;
    if (hud.phase === 'countdown') speaker.rhythmCountdown();
    else if (hud.phase === 'over') speaker.rhythmGameOver(hud.stats.rating, hud.score);
  }, [hud.phase, hud.score, hud.stats]);

  useEffect(() => {
    if (gestureEvents.includes('confirm') && (hud.phase === 'ready' || hud.phase === 'over')) {
      soundsRef.current?.confirmSound(frame);
    }
  }, [gestureEvents, frame, hud.phase]);

  const toggleMuted = (): void => {
    const next = !muted;
    setMuted(next);
    writeMuted(next);
    soundsRef.current?.setMuted(next);
  };

  const overlayNode =
    hud.phase === 'over' ? (
      <ResultCard
        result={{ game: 'rhythm', stats: hud.stats }}
        onReplay={replay}
        onSwitchGame={onSwitchGame}
        onHome={onBack}
      />
    ) : hud.phase === 'ready' ? (
      <ReadyCard onStart={() => (latch.confirm = true)} />
    ) : null;

  return (
    <SessionLayout
      showCamera={mode === 'camera'}
      camera={camera}
      cameraPaused={false}
      frame={frame}
      hud={
        <RhythmHudBar
          hud={hud}
          muted={muted}
          onMuteToggle={toggleMuted}
          lastJudge={lastJudge}
        />
      }
      tips={GAME_TIPS.rhythm}
    >
      <RhythmGame
        gameRef={gameRef}
        fxRef={fxRef}
        overlay={overlayNode}
        frameClass={
          mode === 'camera' ? 'max-h-[36vh] xl:max-h-[80vh]' : 'max-h-[60vh] xl:max-h-[80vh]'
        }
      />
    </SessionLayout>
  );
}

function SnakeSession({
  mode,
  gestureState,
  gestureEvents,
  frame,
  camera,
  onBack,
  onSwitchGame,
}: SessionProps) {
  // 演示模式的虚拟转向：朝最近的光球慢慢转；摄像头模式完全不经过这条路
  const { gameRef, latchRef, hud, events: gameEvents, replay } = useSnakeGame({
    inputTransform: mode === 'demo' ? demoSnakeTurn : undefined,
    // 演示模式的虚拟玩家每 3 秒点一次头（= 闪耀时刻），结束后别让它自动再玩
    replayOnConfirm: mode === 'camera',
  });

  const soundsRef = useRef<GameSounds | null>(null);
  const speakerRef = useRef<GameSpeaker | null>(null);
  const fxRef = useRef<SnakeFx>({
    eatUntil: 0,
    eatAt: null,
    eatGold: false,
    boostUntil: 0,
    hitUntil: 0,
    shakeUntil: 0,
    shakePower: 0,
    texts: [],
  });
  const prevPhaseRef = useRef<SnakeGameHud['phase']>('ready');
  const [muted, setMuted] = useState<boolean>(() => readMuted());

  useEffect(() => {
    const sounds = createGameSounds();
    const speaker = createGameSpeaker();
    sounds.setMuted(readMuted());
    soundsRef.current = sounds;
    speakerRef.current = speaker;
    return () => {
      soundsRef.current = null;
      speakerRef.current = null;
      sounds.dispose();
    };
  }, []);

  // 手势脉冲锁存：点头/张嘴只持续一帧，渲染间隔之间出现也不丢
  const latch = latchRef.current;
  latch.cursorX = gestureState.cursorX;
  if (gestureState.confirm || gestureEvents.includes('confirm')) latch.confirm = true;
  if (gestureState.pause || gestureEvents.includes('pause')) latch.pause = true;

  // 事件 → 声音 + 视觉特效：每个音效都有画面替身，听障用户不靠声音
  useEffect(() => {
    if (gameEvents.length === 0) return;
    const sounds = soundsRef.current;
    const fx = fxRef.current;
    const now = performance.now();
    for (const e of gameEvents) {
      switch (e.type) {
        case 'eat':
          sounds?.eatSound(e.gold, e.multiplier);
          fx.eatUntil = now + 300;
          fx.eatAt = { x: e.x, y: e.y };
          fx.eatGold = e.gold;
          fx.texts = [
            ...fx.texts.slice(-5),
            {
              x: e.x,
              y: e.y - 24,
              text: e.multiplier > 1 ? `+${e.points} ×${e.multiplier}` : `+${e.points}`,
              color: e.gold ? '#ffe566' : '#ffd60a',
              until: now + 900,
            },
          ];
          if (e.gold) {
            fx.shakeUntil = now + 220;
            fx.shakePower = 0.35;
          }
          break;
        case 'selfHit':
          sounds?.selfHitSound();
          fx.hitUntil = now + 350;
          fx.shakeUntil = now + 320;
          fx.shakePower = 0.9;
          break;
        case 'boostStart':
          sounds?.boostSound();
          fx.boostUntil = now + BOOST_MS;
          break;
        case 'countdown':
          if (e.remaining === 3) sounds?.startSound();
          break;
        case 'gameOver':
          sounds?.endSound();
          break;
      }
    }
  }, [gameEvents]);

  // 语音只报相位切换，不逐帧叫
  useEffect(() => {
    const speaker = speakerRef.current;
    if (!speaker) return;
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = hud.phase;
    if (hud.phase === prev) return;
    if (hud.phase === 'countdown') speaker.snakeCountdown();
    else if (hud.phase === 'paused') speaker.paused();
    else if (hud.phase === 'playing' && prev === 'paused') speaker.resumed();
    else if (hud.phase === 'over') speaker.snakeGameOver(hud.score);
  }, [hud.phase, hud.score]);

  // 游戏中 confirm 就是闪耀时刻，音效由 boostStart 事件给；只在开始前/结束后给反馈
  useEffect(() => {
    if (gestureEvents.includes('confirm') && (hud.phase === 'ready' || hud.phase === 'over')) {
      soundsRef.current?.confirmSound(frame);
    }
  }, [gestureEvents, frame, hud.phase]);

  // 光标跟随音：转向越狠音量越高；暂停/结束/摄像头不可用时静音
  const trackingActive = hud.phase !== 'paused' && hud.phase !== 'over';
  useEffect(() => {
    soundsRef.current?.setTracking(gestureState.cursorX, trackingActive);
  }, [gestureState.cursorX, trackingActive]);

  const toggleMuted = (): void => {
    const next = !muted;
    setMuted(next);
    writeMuted(next);
    soundsRef.current?.setMuted(next);
  };

  const gamePaused = hud.phase === 'paused';

  const overlayNode =
    hud.phase === 'over' ? (
      <ResultCard
        result={{ game: 'snake', stats: hud.stats }}
        onReplay={replay}
        onSwitchGame={onSwitchGame}
        onHome={onBack}
      />
    ) : hud.phase === 'ready' ? (
      <ReadyCard onStart={() => (latch.confirm = true)} />
    ) : null;

  return (
    <SessionLayout
      showCamera={mode === 'camera'}
      camera={camera}
      cameraPaused={gamePaused}
      frame={frame}
      hud={
        <SnakeHudBar
          hud={hud}
          muted={muted}
          onMuteToggle={toggleMuted}
          onPauseToggle={() => (latchRef.current.pause = true)}
        />
      }
      tips={GAME_TIPS.snake}
    >
      <SnakeGame
        gameRef={gameRef}
        paused={gamePaused}
        fxRef={fxRef}
        overlay={overlayNode}
        frameClass={
          mode === 'camera' ? 'max-h-[36vh] xl:max-h-[80vh]' : 'max-h-[60vh] xl:max-h-[80vh]'
        }
      />
    </SessionLayout>
  );
}

function WhackSession({
  mode,
  gestureState,
  gestureEvents,
  frame,
  camera,
  onBack,
  onSwitchGame,
}: SessionProps) {
  // 演示模式的虚拟玩家整体接管输入（瞄准+点头）；摄像头模式走真实手势
  const { gameRef, latchRef, hud, events: gameEvents, replay } = useWhackGame({
    demo: mode === 'demo',
    replayOnConfirm: mode === 'camera',
  });

  const soundsRef = useRef<GameSounds | null>(null);
  const speakerRef = useRef<GameSpeaker | null>(null);
  const fxRef = useRef<WhackFx>({
    hitUntil: 0,
    hitAt: null,
    hitGold: false,
    whiffUntil: 0,
    whiffAt: null,
    retreatUntil: 0,
    retreatAt: null,
    shakeUntil: 0,
    shakePower: 0,
    texts: [],
  });
  const prevPhaseRef = useRef<WhackGameHud['phase']>('ready');
  const [muted, setMuted] = useState<boolean>(() => readMuted());

  useEffect(() => {
    const sounds = createGameSounds();
    const speaker = createGameSpeaker();
    sounds.setMuted(readMuted());
    soundsRef.current = sounds;
    speakerRef.current = speaker;
    return () => {
      soundsRef.current = null;
      speakerRef.current = null;
      sounds.dispose();
    };
  }, []);

  // 手势脉冲锁存：点头/张嘴只持续一帧，渲染间隔之间出现也不丢
  const latch = latchRef.current;
  latch.cursorX = gestureState.cursorX;
  if (gestureState.confirm || gestureEvents.includes('confirm')) latch.confirm = true;
  if (gestureState.pause || gestureEvents.includes('pause')) latch.pause = true;

  // 事件 → 声音 + 视觉特效：每个音效都有画面替身，听障用户不靠声音
  useEffect(() => {
    if (gameEvents.length === 0) return;
    const sounds = soundsRef.current;
    const fx = fxRef.current;
    const now = performance.now();
    for (const e of gameEvents) {
      switch (e.type) {
        case 'hit': {
          sounds?.whackHitSound(e.gold, e.multiplier);
          const [x, y] = HOLE_POSITIONS[e.hole];
          fx.hitUntil = now + 300;
          fx.hitAt = { x, y: y - 30 };
          fx.hitGold = e.gold;
          fx.texts = [
            ...fx.texts.slice(-5),
            {
              x,
              y: y - 58,
              text: e.multiplier > 1 ? `+${e.points} ×${e.multiplier}` : `+${e.points}`,
              color: e.gold ? '#ffe566' : '#ffd60a',
              until: now + 900,
            },
          ];
          if (e.gold) {
            fx.shakeUntil = now + 220;
            fx.shakePower = 0.35;
          }
          break;
        }
        case 'whiff': {
          // 敲空没有声音，只有红叉 —— 刻意安静，不吓人
          const { x, y } = whackPathPoint(((gameRef.current?.cursorX ?? 0) + 1) / 2);
          fx.whiffUntil = now + 320;
          fx.whiffAt = { x, y };
          break;
        }
        case 'retreat': {
          sounds?.whackRetreatSound();
          const [x, y] = HOLE_POSITIONS[e.hole];
          fx.retreatUntil = now + 320;
          fx.retreatAt = { x, y };
          break;
        }
        case 'countdown':
          if (e.remaining === 3) sounds?.startSound();
          break;
        case 'gameOver':
          sounds?.endSound();
          break;
      }
    }
  }, [gameEvents]);

  // 语音只报相位切换，不逐帧叫
  useEffect(() => {
    const speaker = speakerRef.current;
    if (!speaker) return;
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = hud.phase;
    if (hud.phase === prev) return;
    if (hud.phase === 'countdown') speaker.whackCountdown();
    else if (hud.phase === 'paused') speaker.paused();
    else if (hud.phase === 'playing' && prev === 'paused') speaker.resumed();
    else if (hud.phase === 'over') speaker.whackGameOver(hud.score);
  }, [hud.phase, hud.score]);

  // 游戏中 confirm 就是敲击，音效由 hit/whiff 事件给；只在开始前/结束后给反馈
  useEffect(() => {
    if (gestureEvents.includes('confirm') && (hud.phase === 'ready' || hud.phase === 'over')) {
      soundsRef.current?.confirmSound(frame);
    }
  }, [gestureEvents, frame, hud.phase]);

  // 光标跟随音：越靠边音量越高；暂停/结束/摄像头不可用时静音
  const trackingActive = hud.phase !== 'paused' && hud.phase !== 'over';
  useEffect(() => {
    soundsRef.current?.setTracking(gestureState.cursorX, trackingActive);
  }, [gestureState.cursorX, trackingActive]);

  const toggleMuted = (): void => {
    const next = !muted;
    setMuted(next);
    writeMuted(next);
    soundsRef.current?.setMuted(next);
  };

  const gamePaused = hud.phase === 'paused';

  const overlayNode =
    hud.phase === 'over' ? (
      <ResultCard
        result={{ game: 'whack', stats: hud.stats }}
        onReplay={replay}
        onSwitchGame={onSwitchGame}
        onHome={onBack}
      />
    ) : hud.phase === 'ready' ? (
      <ReadyCard onStart={() => (latch.confirm = true)} />
    ) : null;

  return (
    <SessionLayout
      showCamera={mode === 'camera'}
      camera={camera}
      cameraPaused={gamePaused}
      frame={frame}
      hud={
        <WhackHudBar
          hud={hud}
          muted={muted}
          onMuteToggle={toggleMuted}
          onPauseToggle={() => (latchRef.current.pause = true)}
        />
      }
      tips={GAME_TIPS.whack}
    >
      <WhackGame
        gameRef={gameRef}
        paused={gamePaused}
        fxRef={fxRef}
        overlay={overlayNode}
        frameClass={
          mode === 'camera' ? 'max-h-[36vh] xl:max-h-[80vh]' : 'max-h-[60vh] xl:max-h-[80vh]'
        }
      />
    </SessionLayout>
  );
}

function CandleSession({
  mode,
  gestureState,
  gestureEvents,
  frame,
  camera,
  onBack,
  onSwitchGame,
}: SessionProps) {
  // 演示模式的虚拟玩家整体接管输入（点头开局 + 节拍张嘴）；摄像头模式走真实手势
  const { gameRef, latchRef, hud, events: gameEvents, replay } = useCandleGame({
    demo: mode === 'demo',
    replayOnConfirm: mode === 'camera',
  });

  const soundsRef = useRef<GameSounds | null>(null);
  const speakerRef = useRef<GameSpeaker | null>(null);
  const fxRef = useRef<CandleFx>({
    extinguishUntil: 0,
    extinguishAt: null,
    extinguishBonus: false,
    shakeUntil: 0,
    shakePower: 0,
    texts: [],
  });
  const prevPhaseRef = useRef<CandleGameHud['phase']>('ready');
  const [muted, setMuted] = useState<boolean>(() => readMuted());

  useEffect(() => {
    const sounds = createGameSounds();
    const speaker = createGameSpeaker();
    sounds.setMuted(readMuted());
    soundsRef.current = sounds;
    speakerRef.current = speaker;
    return () => {
      soundsRef.current = null;
      speakerRef.current = null;
      sounds.dispose();
    };
  }, []);

  // 手势锁存：点头脉冲 + 张嘴电平（blow 就是吹气，没有暂停语义）
  const latch = latchRef.current;
  if (gestureState.confirm || gestureEvents.includes('confirm')) latch.confirm = true;
  if (gestureState.pause || gestureEvents.includes('pause')) latch.blow = true;

  // 事件 → 声音 + 视觉特效：每个音效都有画面替身，听障用户不靠声音
  useEffect(() => {
    if (gameEvents.length === 0) return;
    const sounds = soundsRef.current;
    const fx = fxRef.current;
    const now = performance.now();
    for (const e of gameEvents) {
      switch (e.type) {
        case 'extinguish': {
          sounds?.extinguishSound(e.bonus > 0);
          const { x, y } = candleFlamePos(e.index);
          fx.extinguishUntil = now + 700;
          fx.extinguishAt = { x, y };
          fx.extinguishBonus = e.bonus > 0;
          fx.texts = [
            ...fx.texts.slice(-5),
            {
              x,
              y: y - 40,
              text: e.bonus > 0 ? `+${e.points} 连吹 +${e.bonus}` : `+${e.points}`,
              color: e.bonus > 0 ? '#58c4ff' : '#ffd60a',
              until: now + 900,
            },
          ];
          fx.shakeUntil = now + 200;
          fx.shakePower = 0.25;
          break;
        }
        case 'countdown':
          if (e.remaining === 3) sounds?.startSound();
          break;
        case 'gameOver':
          sounds?.endSound();
          break;
      }
    }
  }, [gameEvents]);

  // 语音只报相位切换，不逐帧叫
  useEffect(() => {
    const speaker = speakerRef.current;
    if (!speaker) return;
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = hud.phase;
    if (hud.phase === prev) return;
    if (hud.phase === 'countdown') speaker.candleCountdown();
    else if (hud.phase === 'over') speaker.candleGameOver(hud.score);
  }, [hud.phase, hud.score]);

  // 点头在游戏中无效（吹气才是操作），只在开始前/结束后给反馈
  useEffect(() => {
    if (gestureEvents.includes('confirm') && (hud.phase === 'ready' || hud.phase === 'over')) {
      soundsRef.current?.confirmSound(frame);
    }
  }, [gestureEvents, frame, hud.phase]);

  const toggleMuted = (): void => {
    const next = !muted;
    setMuted(next);
    writeMuted(next);
    soundsRef.current?.setMuted(next);
  };

  const overlayNode =
    hud.phase === 'over' ? (
      <ResultCard
        result={{ game: 'candle', stats: hud.stats }}
        onReplay={replay}
        onSwitchGame={onSwitchGame}
        onHome={onBack}
      />
    ) : hud.phase === 'ready' ? (
      <ReadyCard onStart={() => (latch.confirm = true)} />
    ) : null;

  return (
    <SessionLayout
      showCamera={mode === 'camera'}
      camera={camera}
      cameraPaused={false}
      frame={frame}
      hud={<CandleHudBar hud={hud} muted={muted} onMuteToggle={toggleMuted} />}
      tips={GAME_TIPS.candle}
    >
      <CandleGame
        gameRef={gameRef}
        fxRef={fxRef}
        overlay={overlayNode}
        frameClass={
          mode === 'camera' ? 'max-h-[36vh] xl:max-h-[80vh]' : 'max-h-[60vh] xl:max-h-[80vh]'
        }
      />
    </SessionLayout>
  );
}

// ———— 会话布局外壳：xl 两栏（左画布 / 右 HUD+预览+提示），窄屏上下堆叠 ————
interface SessionLayoutProps {
  showCamera: boolean;
  camera: SessionProps['camera'];
  cameraPaused: boolean;
  frame: RawFrame | null;
  hud: ReactNode;
  tips: readonly string[];
  children: ReactNode;
}

function SessionLayout({
  showCamera,
  camera,
  cameraPaused,
  frame,
  hud,
  tips,
  children,
}: SessionLayoutProps) {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="order-2 min-w-0 xl:order-1">{children}</div>
      <div className="order-1 flex flex-col gap-4 xl:order-2">
        {showCamera ? (
          <div className="mx-auto w-full max-w-80 xl:max-w-none">
            <CameraStage
              videoRef={camera.videoRef}
              source={camera.source}
              mirrored={camera.mirrored}
              overlay={camera.overlay}
              paused={cameraPaused}
              frame={frame}
              onDemo={camera.onDemo}
            />
          </div>
        ) : null}
        {hud}
        <TipsCard tips={tips} />
      </div>
    </div>
  );
}

const GAME_TIPS: Record<'star' | 'rhythm' | 'snake' | 'whack' | 'candle', readonly string[]> = {
  star: ['转头左右移动挡板', '金色星星分值更高', '点头开始，张嘴暂停'],
  rhythm: ['看收缩环，环与目标圈重合时点头', '连击只数 Perfect，Good / Miss 都清零'],
  snake: ['转头控制方向，小蛇不会停', '连续吃光球叠连击倍率', '点头开启闪耀，双倍得分', '张嘴暂停'],
  whack: ['转头沿蛇形路径移动准星', '对准冒头的地鼠点头敲下', '金色地鼠分值更高', '敲空断连击，地鼠缩回算漏', '张嘴暂停'],
  candle: ['对准蜡烛张嘴吹气', '累计张嘴约半秒吹灭一支', '2 秒内连吹下一支有奖励', '60 秒内吹完全部'],
};

function TipsCard({ tips }: { tips: readonly string[] }) {
  return (
    <aside className="card-surface flex flex-col gap-2.5 rounded-card border border-edge px-5 py-4 shadow-card">
      <h3 className="flex items-center gap-2 text-lg font-bold">
        <Lightbulb size={18} aria-hidden="true" className="shrink-0 text-accent" />
        玩法提示
      </h3>
      <ul className="flex flex-col gap-1.5 text-base leading-snug text-dim">
        {tips.map((tip) => (
          <li key={tip} className="flex gap-2.5">
            <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" />
            {tip}
          </li>
        ))}
      </ul>
    </aside>
  );
}

// ———— HUD 与覆盖层 ————

interface StarHudBarProps {
  hud: StarGameHud;
  muted: boolean;
  onMuteToggle: () => void;
  onPauseToggle: () => void;
}

function StarHudBar({ hud, muted, onMuteToggle, onPauseToggle }: StarHudBarProps) {
  return (
    <HudContainer>
      <HudScore score={hud.score} />
      <HudLives lives={hud.lives} total={START_LIVES} />
      {hud.multiplier > 1 ? (
        <HudBadge live>×{hud.multiplier} · 连击 {hud.combo}</HudBadge>
      ) : null}
      <HudActions
        muted={muted}
        onMuteToggle={onMuteToggle}
        paused={hud.phase === 'paused'}
        onPauseToggle={onPauseToggle}
      />
      <CountdownAnnouncer active={hud.phase === 'countdown'} remaining={hud.countdownRemaining} />
    </HudContainer>
  );
}

const JUDGE_LABELS: Record<JudgeResult, string> = {
  perfect: 'Perfect',
  good: 'Good',
  miss: 'Miss',
};

interface RhythmHudBarProps {
  hud: RhythmGameHud;
  muted: boolean;
  onMuteToggle: () => void;
  lastJudge: JudgeResult | null;
}

function RhythmHudBar({ hud, muted, onMuteToggle, lastJudge }: RhythmHudBarProps) {
  return (
    <HudContainer>
      <HudScore score={hud.score} />
      <HudStat label="拍子" value={`${hud.judged} / ${hud.total}`} />
      {hud.combo > 0 ? <HudBadge live>连击 {hud.combo}</HudBadge> : null}
      <HudField label="判定">
        <p
          aria-live="polite"
          aria-label={lastJudge ? `判定 ${JUDGE_LABELS[lastJudge]}` : ''}
          className={`text-lg font-black ${lastJudge ? '' : 'invisible'}`}
        >
          {lastJudge ? JUDGE_LABELS[lastJudge] : '·'}
        </p>
      </HudField>
      <HudActions muted={muted} onMuteToggle={onMuteToggle} />
      <CountdownAnnouncer active={hud.phase === 'countdown'} remaining={hud.countdownRemaining} />
    </HudContainer>
  );
}

function mmss(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  return `${m}:${String(totalSec % 60).padStart(2, '0')}`;
}

interface SnakeHudBarProps {
  hud: SnakeGameHud;
  muted: boolean;
  onMuteToggle: () => void;
  onPauseToggle: () => void;
}

function SnakeHudBar({ hud, muted, onMuteToggle, onPauseToggle }: SnakeHudBarProps) {
  return (
    <HudContainer>
      <HudScore score={hud.score} />
      <HudStat label="时间" value={mmss(hud.timeLeft)} live />
      <HudStat label="长度" value={String(hud.length)} />
      {hud.multiplier > 1 ? (
        <HudBadge live>×{hud.multiplier} · 连击 {hud.combo}</HudBadge>
      ) : null}
      {hud.boostActive ? (
        <HudBadge tone="accent-hi" live>
          闪耀 ×2
        </HudBadge>
      ) : null}
      <HudActions
        muted={muted}
        onMuteToggle={onMuteToggle}
        paused={hud.phase === 'paused'}
        onPauseToggle={onPauseToggle}
      />
      <CountdownAnnouncer active={hud.phase === 'countdown'} remaining={hud.countdownRemaining} />
    </HudContainer>
  );
}

interface WhackHudBarProps {
  hud: WhackGameHud;
  muted: boolean;
  onMuteToggle: () => void;
  onPauseToggle: () => void;
}

function WhackHudBar({ hud, muted, onMuteToggle, onPauseToggle }: WhackHudBarProps) {
  return (
    <HudContainer>
      <HudScore score={hud.score} />
      <HudStat label="敲中" value={`${hud.hits} / ${TARGET_HITS}`} live />
      <HudStat label="漏" value={`${hud.misses} / ${MAX_MISSES}`} />
      {hud.multiplier > 1 ? (
        <HudBadge live>×{hud.multiplier} · 连击 {hud.combo}</HudBadge>
      ) : null}
      <HudActions
        muted={muted}
        onMuteToggle={onMuteToggle}
        paused={hud.phase === 'paused'}
        onPauseToggle={onPauseToggle}
      />
      <CountdownAnnouncer active={hud.phase === 'countdown'} remaining={hud.countdownRemaining} />
    </HudContainer>
  );
}

interface CandleHudBarProps {
  hud: CandleGameHud;
  muted: boolean;
  onMuteToggle: () => void;
}

function CandleHudBar({ hud, muted, onMuteToggle }: CandleHudBarProps) {
  return (
    <HudContainer>
      <HudScore score={hud.score} />
      <HudStat label="已灭" value={`${hud.extinguished} / ${CANDLE_COUNT}`} live />
      {hud.chained > 0 ? <HudBadge live>连吹 {hud.chained}</HudBadge> : null}
      <HudActions muted={muted} onMuteToggle={onMuteToggle} />
      <CountdownAnnouncer active={hud.phase === 'countdown'} remaining={hud.countdownRemaining} />
    </HudContainer>
  );
}

function ReadyCard({ onStart }: { onStart: () => void }) {  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-card bg-page/85 p-6 text-center backdrop-blur-sm">
      <p className="flex items-center gap-2 text-3xl font-black">
        <Sparkles size={28} aria-hidden="true" className="text-accent" />
        准备好了吗？
      </p>
      <p className="text-lg text-dim">点点头、眨眨眼，或点下面的按钮开始</p>
      <Button onClick={onStart} hint="点头、眨眼、张嘴都不方便时，可以点这里">
        开始游戏
      </Button>
    </div>
  );
}
