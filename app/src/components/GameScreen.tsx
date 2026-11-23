import { useEffect, useRef, useState } from 'react';
import { useDebugTrace } from '../hooks/useDebugTrace';
import { useGesture } from '../hooks/useGesture';
import { useStarGame } from '../hooks/useStarGame';
import type { StarGameHud } from '../hooks/useStarGame';
import { CameraSource } from '../input/cameraSource';
import type { Calibration, GestureEvent } from '../input/types';
import { ScriptedSource } from '../input/scriptedSource';
import { demoAimCursor } from '../game/demoAim';
import { createGameSpeaker } from '../game/gameSpeech';
import type { GameSpeaker } from '../game/gameSpeech';
import { readMuted, writeMuted } from '../game/playerPrefs';
import { createGameSounds } from '../game/sound';
import type { GameSounds } from '../game/sound';
import type { GameOverCause } from '../game/starGame';
import type { Mode } from '../state/machine';
import Button from './Button';
import CameraStage, { CameraProblemCard } from './CameraStage';
import DebugPanel from './DebugPanel';
import StarGame from './StarGame';
import type { GameFx } from './StarGame';
import TopBar from './TopBar';

interface GameScreenProps {
  mode: Mode;
  /** 校准值只在摄像头模式下生效；演示模式恒用引擎默认量程。 */
  calibration?: Required<Calibration> | null;
  onBack: () => void;
  onDemo: () => void;
}

const EVENT_LOG_SIZE = 8;

export default function GameScreen({ mode, calibration, onBack, onDemo }: GameScreenProps) {
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
  latch.cursorX = state.cursorX;
  if (state.confirm || events.includes('confirm')) latch.confirm = true;
  if (state.pause || events.includes('pause')) latch.pause = true;

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
  const gamePaused = hud.phase === 'paused';

  const toggleMuted = (): void => {
    const next = !muted;
    setMuted(next);
    writeMuted(next);
    soundsRef.current?.setMuted(next);
  };

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
    if (
      events.includes('confirm') &&
      (hud.phase === 'ready' || hud.phase === 'over')
    ) {
      soundsRef.current?.confirmSound(frame);
    }
  }, [events, frame, hud.phase]);

  // 光标跟随音：越靠边音量越高；暂停/结束/摄像头不可用时静音
  const trackingActive = !problem && hud.phase !== 'paused' && hud.phase !== 'over';
  useEffect(() => {
    soundsRef.current?.setTracking(state.cursorX, trackingActive);
  }, [state.cursorX, trackingActive]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <TopBar
        title="接星星"
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

      <HudBar
        hud={hud}
        muted={muted}
        onMuteToggle={toggleMuted}
        onPauseToggle={() => (latchRef.current.pause = true)}
      />

      {mode === 'demo' ? (
        <StarGame
          gameRef={gameRef}
          paused={gamePaused}
          fxRef={fxRef}
          overlay={
            hud.phase === 'over' && hud.overCause ? (
              <EndCard
                stats={hud.stats}
                cause={hud.overCause}
                onReplay={replay}
                onHome={onBack}
              />
            ) : null
          }
        />
      ) : problem ? (
        <CameraProblemCard message={problem} onDemo={onDemo} />
      ) : (
        <>
          <CameraStage
            videoRef={videoRef}
            source={cameraSource}
            mirrored={mirrorX === -1}
            overlay={overlay}
            paused={gamePaused}
            frame={frame}
            onDemo={onDemo}
          />
          <StarGame
            gameRef={gameRef}
            paused={gamePaused}
            fxRef={fxRef}
            overlay={
              hud.phase === 'over' && hud.overCause ? (
                <EndCard
                  stats={hud.stats}
                  cause={hud.overCause}
                  onReplay={replay}
                  onHome={onBack}
                />
              ) : null
            }
          />
        </>
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

interface HudBarProps {
  hud: StarGameHud;
  muted: boolean;
  onMuteToggle: () => void;
  onPauseToggle: () => void;
}

function HudBar({ hud, muted, onMuteToggle, onPauseToggle }: HudBarProps) {
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
        <button
          type="button"
          onClick={onMuteToggle}
          aria-pressed={muted}
          className="min-h-16 rounded-card border-2 border-edge bg-page px-5 text-lg font-bold text-fg hover:border-accent"
        >
          音效：{muted ? '关' : '开'}
        </button>
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

interface EndCardProps {
  stats: StarGameHud['stats'];
  cause: GameOverCause;
  onReplay: () => void;
  onHome: () => void;
}

function EndCard({ stats, cause, onReplay, onHome }: EndCardProps) {
  return (
    <section
      aria-label="本局结束"
      className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-card bg-page/95 p-6"
    >
      <h2 className="text-3xl font-black">{cause === 'time' ? '时间到！' : '本局结束'}</h2>
      <p className="text-5xl font-black tabular-nums text-accent">得分 {stats.score}</p>
      <div className="flex flex-col items-center gap-1 text-lg text-dim">
        <p>
          接住 {stats.caught} / 共 {stats.total}
        </p>
        <p>最长连击 {stats.maxCombo}</p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button onClick={onReplay} hint="点头或眨眼也可以">
          再玩一次
        </Button>
        <Button variant="secondary" onClick={onHome}>
          返回首页
        </Button>
      </div>
    </section>
  );
}
