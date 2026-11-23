import { useEffect, useRef, useState } from 'react';
import { useCalibration } from '../hooks/useCalibration';
import { STEP_COPY } from '../calibration/steps';
import { currentStep } from '../calibration/sequencer';
import type { CalibrationResult } from '../calibration/result';
import Button from './Button';
import CameraStage, { CameraProblemCard } from './CameraStage';
import OffsetBar from './OffsetBar';
import ProgressRing from './ProgressRing';
import TopBar from './TopBar';

interface CalibrationScreenProps {
  onBack: () => void;
  /** null = 用默认值继续（不写盘）；非 null = 这次真采到了数 */
  onFinish: (result: CalibrationResult | null) => void;
  onDemo: () => void;
}

/** 摘要停够读三行数字的时间，再自己走进游戏。 */
const AUTO_ENTER_SECONDS = 8;

export default function CalibrationScreen({
  onBack,
  onFinish,
  onDemo,
}: CalibrationScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    state,
    result,
    usedDefaults,
    live,
    progress,
    blinksLeft,
    frame,
    source,
    error,
    voiceEnabled,
    toggleVoice,
    redoStep,
    useDefaults,
    restart,
  } = useCalibration(videoRef);

  const [secondsLeft, setSecondsLeft] = useState(AUTO_ENTER_SECONDS);
  const sentRef = useRef(false);

  useEffect(() => {
    if (usedDefaults) onFinish(null);
  }, [usedDefaults, onFinish]);

  useEffect(() => {
    if (result === null) return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [result]);

  useEffect(() => {
    if (result !== null && secondsLeft === 0) enter(result);
  }, [result, secondsLeft]);

  function enter(r: CalibrationResult | null): void {
    if (sentRef.current) return;
    sentRef.current = true;
    onFinish(r);
  }

  function recalibrate(): void {
    sentRef.current = false;
    setSecondsLeft(AUTO_ENTER_SECONDS);
    restart();
  }

  const { total } = currentStep(state);
  const copy = STEP_COPY[state.step];
  const givingUp = state.status === 'giveUp';

  // 「用默认值继续」和「跳过」没有数字可看，直接走
  if (result !== null) {
    return (
      <div className="flex flex-col gap-6">
        <TopBar title="校准完成" onBack={onBack} />
        <Summary result={result} />
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => enter(result)} hint={`${secondsLeft} 秒后自动进入`}>
            立即进入游戏
          </Button>
          <Button variant="secondary" onClick={recalibrate} hint="换个坐姿、换个人，再来一遍">
            重新校准
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <TopBar title="30 秒校准" onBack={onBack} />

      {error ? (
        <CameraProblemCard message={error} onDemo={onDemo} />
      ) : (
        <CameraStage
          videoRef={videoRef}
          source={source}
          mirrored
          overlay
          paused={false}
          frame={frame}
          onDemo={onDemo}
        />
      )}

      <div className="flex items-center gap-4">
        <ProgressRing
          value={progress}
          label={`${copy.title}，共 ${total} 步`}
          icon={copy.icon}
        />
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold">{copy.title}</h2>
          <p className="text-lg text-dim">{copy.detail}</p>
          <p className="text-base text-dim">{copy.hint}</p>
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {`${copy.title}（共 ${total} 步）。${copy.detail}`}
        {state.attempt === 2 ? '没感觉到，这一步自动重来一次。' : ''}
      </p>

      {state.step === 'confirm' ? (
        <p className="text-lg font-semibold">
          还差 {blinksLeft} 次眨眼
          <span className="ml-2 text-base text-dim">眨不动就按空格键，同样算确认。</span>
        </p>
      ) : (
        <OffsetBar axis={live.axis} offset={live.offset} target={live.target} capturing={live.capturing} />
      )}

      {givingUp ? (
        <div className="card-surface flex flex-col gap-3 rounded-card border border-edge p-5 shadow-card">
          <h3 className="text-xl font-bold">{STEP_COPY.giveUp.title}</h3>
          <p className="text-lg text-dim">{STEP_COPY.giveUp.detail}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={redoStep} hint="这一步重来，其它步不重做">
              重做这一步
            </Button>
            <Button variant="secondary" onClick={useDefaults} hint="不保存任何东西">
              用默认值继续
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          variant="secondary"
          onClick={toggleVoice}
          hint={voiceEnabled ? '关掉后只剩屏幕文字' : '播报当前步骤的指令'}
        >
          语音播报：{voiceEnabled ? '开' : '关'}
        </Button>
        <Button variant="secondary" onClick={useDefaults} hint="用默认量程进游戏，不需要摄像头也行">
          跳过，使用默认值
        </Button>
      </div>
    </div>
  );
}

function Summary({ result }: { result: CalibrationResult }) {
  return (
    <section
      aria-label="校准结果"
      className="card-surface flex flex-col gap-3 rounded-card border border-edge p-5 shadow-card"
    >
      <h2 className="text-2xl font-bold">这次用到的量程</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-lg sm:grid-cols-3">
        <dt className="text-dim">yawRange</dt>
        <dd>{result.yawRange.toFixed(3)}</dd>
        <dt className="text-dim">pitchRange</dt>
        <dd>{result.pitchRange.toFixed(3)}</dd>
        <dt className="text-dim">灵敏度</dt>
        <dd>{result.sensitivity}%</dd>
      </dl>
      {result.yawClampedToMax ? (
        <p className="text-lg font-semibold text-accent">
          转头幅度超过上限，已自动压缩灵敏度 —— 再转也是同一位置，不用勉强。
        </p>
      ) : null}
      {result.yawClampedToMin ? (
        <p className="text-lg font-semibold text-accent">
          活动幅度小，已自动放大灵敏度：轻轻一转就能走满全屏。
        </p>
      ) : null}
      {result.pitchCapped ? (
        <p className="text-lg text-dim">点头幅度按上限截到 {result.pitchRange.toFixed(2)}。</p>
      ) : null}
      <p className="text-base text-dim">
        只存了这几个数字，没有画面、没有照片，也没有上传任何东西。
      </p>
    </section>
  );
}
