import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useDebugTrace } from '../hooks/useDebugTrace';
import { useGesture } from '../hooks/useGesture';
import { useRhythmGame } from '../hooks/useRhythmGame';
import type { RhythmGameHud } from '../hooks/useRhythmGame';
import { useStarGame } from '../hooks/useStarGame';
import type { StarGameHud } from '../hooks/useStarGame';
import { CameraSource } from '../input/cameraSource';
import type { Calibration, GestureEvent, InputState, RawFrame } from '../input/types';
import { ScriptedSource } from '../input/scriptedSource';
import { demoAimCursor } from '../game/demoAim';
import { demoRhythmInput } from '../game/demoRhythm';
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
import TopBar from './TopBar';

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
        title={gameId === 'star' ? '接星星' : '节奏点头'}
        onBack={onBack}
        right={
          <span className="rounded-full border-2 border-edge bg-card px-4 py-2 text-base font-bold text-dim">
            {mode === 'demo' ? '演示模式' : '摄像头'}
          </span>
        }
      />

      {mode === 'demo' ? (
        <p className="rounded-card bg-card px-5 py-3 text-lg text-dim">
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
      ) : (
        <RhythmSession
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

// ———— 两个游戏的会话组件：各自持有自己的纯逻辑 hook、音效与覆盖层 ————

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
  const fxRef = useRef<GameFx>({ catchUntil: 0, catchAt: null, missUntil: 0 });
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
          break;
        case 'miss':
          sounds?.missSound();
          fx.missUntil = now + 350;
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
    <>
      <StarHudBar
        hud={hud}
        muted={muted}
        onMuteToggle={toggleMuted}
        onPauseToggle={() => (latchRef.current.pause = true)}
      />
      {mode === 'camera' ? (
        // 预览压成小窗：4:3 全宽会把下面的游戏画布整个挤出屏幕
        <div className="mx-auto w-full max-w-xs">
          <CameraStage
            videoRef={camera.videoRef}
            source={camera.source}
            mirrored={camera.mirrored}
            overlay={camera.overlay}
            paused={gamePaused}
            frame={frame}
            onDemo={camera.onDemo}
          />
        </div>
      ) : null}
      <StarGame
        gameRef={gameRef}
        paused={gamePaused}
        fxRef={fxRef}
        overlay={overlayNode}
        frameClass={mode === 'camera' ? 'max-h-[36vh]' : undefined}
      />
    </>
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
  const fxRef = useRef<RhythmFx>({ judgeUntil: 0, judge: null, beatUntil: 0 });
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
    <>
      <RhythmHudBar
        hud={hud}
        muted={muted}
        onMuteToggle={toggleMuted}
        lastJudge={lastJudge}
      />
      {mode === 'camera' ? (
        <div className="mx-auto w-full max-w-xs">
          <CameraStage
            videoRef={camera.videoRef}
            source={camera.source}
            mirrored={camera.mirrored}
            overlay={camera.overlay}
            paused={false}
            frame={frame}
            onDemo={camera.onDemo}
          />
        </div>
      ) : null}
      <RhythmGame
        gameRef={gameRef}
        fxRef={fxRef}
        overlay={overlayNode}
        frameClass={mode === 'camera' ? 'max-h-[36vh]' : undefined}
      />
    </>
  );
}

// ———— HUD 与覆盖层 ————

interface MutedControls {
  muted: boolean;
  onMuteToggle: () => void;
}

function MuteButton({ muted, onMuteToggle }: MutedControls) {
  return (
    <button
      type="button"
      onClick={onMuteToggle}
      aria-pressed={muted}
      className="min-h-16 rounded-card border-2 border-edge bg-page px-5 text-lg font-bold text-fg hover:border-accent"
    >
      音效：{muted ? '关' : '开'}
    </button>
  );
}

interface StarHudBarProps extends MutedControls {
  hud: StarGameHud;
  onPauseToggle: () => void;
}

function StarHudBar({ hud, muted, onMuteToggle, onPauseToggle }: StarHudBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-card border-2 border-edge bg-card px-5 py-3">
      <p className="text-2xl font-black tabular-nums">
        <span aria-live="polite" aria-label={`得分 ${hud.score}`}>
          得分 {hud.score}
        </span>
      </p>

      <p
        role="img"
        aria-label={`生命值：剩 ${hud.lives} 条，共 3 条`}
        className="flex items-center gap-1.5"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full ${i < hud.lives ? 'bg-accent' : 'bg-edge'}`}
          />
        ))}
      </p>

      {hud.multiplier > 1 ? (
        <p
          aria-live="polite"
          className="rounded-full bg-accent px-3 py-1 text-base font-black text-accent-fg"
        >
          ×{hud.multiplier} · 连击 {hud.combo}
        </p>
      ) : null}

      <div className="ml-auto flex gap-3">
        <MuteButton muted={muted} onMuteToggle={onMuteToggle} />
        <button
          type="button"
          onClick={onPauseToggle}
          aria-label={hud.phase === 'paused' ? '继续游戏' : '暂停游戏'}
          className="min-h-16 rounded-card border-2 border-edge bg-page px-5 text-lg font-bold text-fg hover:border-accent"
        >
          {hud.phase === 'paused' ? '继续' : '暂停'}
        </button>
      </div>

      <span className="sr-only" aria-live="polite">
        {hud.phase === 'countdown' ? `倒计时 ${hud.countdownRemaining}` : ''}
      </span>
    </div>
  );
}

const JUDGE_LABELS: Record<JudgeResult, string> = {
  perfect: 'Perfect',
  good: 'Good',
  miss: 'Miss',
};

interface RhythmHudBarProps extends MutedControls {
  hud: RhythmGameHud;
  lastJudge: JudgeResult | null;
}

function RhythmHudBar({ hud, muted, onMuteToggle, lastJudge }: RhythmHudBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-card border-2 border-edge bg-card px-5 py-3">
      <p className="text-2xl font-black tabular-nums">
        <span aria-live="polite" aria-label={`得分 ${hud.score}`}>
          得分 {hud.score}
        </span>
      </p>

      <p className="text-lg font-bold text-dim">
        拍子 {hud.judged} / {hud.total}
      </p>

      {hud.combo > 0 ? (
        <p
          aria-live="polite"
          className="rounded-full bg-accent px-3 py-1 text-base font-black text-accent-fg"
        >
          连击 {hud.combo}
        </p>
      ) : null}

      <p
        aria-live="polite"
        aria-label={lastJudge ? `判定 ${JUDGE_LABELS[lastJudge]}` : ''}
        className={`text-lg font-black ${lastJudge ? '' : 'invisible'}`}
      >
        {lastJudge ? JUDGE_LABELS[lastJudge] : '·'}
      </p>

      <div className="ml-auto flex gap-3">
        <MuteButton muted={muted} onMuteToggle={onMuteToggle} />
      </div>

      <span className="sr-only" aria-live="polite">
        {hud.phase === 'countdown' ? `倒计时 ${hud.countdownRemaining}` : ''}
      </span>
    </div>
  );
}

function ReadyCard({ onStart }: { onStart: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-card bg-page/85 p-6 text-center">
      <p className="text-3xl font-black">准备好了吗？</p>
      <p className="text-lg text-dim">点点头、眨眨眼，或点下面的按钮开始</p>
      <Button onClick={onStart} hint="点头、眨眼、张嘴都不方便时，可以点这里">
        开始游戏
      </Button>
    </div>
  );
}
