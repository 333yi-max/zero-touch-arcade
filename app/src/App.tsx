import { useEffect, useReducer, useState } from 'react';
import BootLoading from './components/BootLoading';
import CalibrationScreen from './components/CalibrationScreen';
import DevlogScreen from './components/DevlogScreen';
import GameScreen from './components/GameScreen';
import SelectScreen from './components/SelectScreen';
import StartScreen from './components/StartScreen';
import { toEngineCalibration, type CalibrationResult } from './calibration/result';
import {
  fromStoredCalibration,
  readStoredCalibration,
  toStoredCalibration,
  writeStoredCalibration,
} from './calibration/storage';
import type { Calibration } from './input/types';
import { initialState, next } from './state/machine';

export default function App() {
  // 开机读一次：本机存过校准值就说明不用再花 30 秒
  const [boot] = useState(() => {
    const stored = readStoredCalibration();
    return { calibration: stored === null ? null : fromStoredCalibration(stored), has: stored !== null };
  });
  const [state, send] = useReducer(next, initialState, (s) => ({ ...s, calibrated: boot.has }));
  const [calibration, setCalibration] = useState<Required<Calibration> | null>(boot.calibration);
  const [saveNotice, setSaveNotice] = useState('');
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setBooting(false), 900);
    return () => window.clearTimeout(t);
  }, []);

  const finishCalibration = (result: CalibrationResult | null): void => {
    if (result === null) {
      // 「跳过，使用默认值」和失败后的「用默认值继续」同一条路：不写盘
      setCalibration(null);
      setSaveNotice('');
      send({ type: 'calibration_skipped' });
      return;
    }
    setCalibration(toEngineCalibration(result));
    // 私密模式 / 存储被禁用时写不进去，但这次会话照样用得上，只是下次要重校
    setSaveNotice(
      writeStoredCalibration(toStoredCalibration(result, Date.now()))
        ? ''
        : '校准这次能用，但本机没能保存 —— 下次打开需要重新校准。',
    );
    send({ type: 'calibration_finished' });
  };

  if (booting) return <BootLoading />;

  // 首页/选游戏/游戏页/开发日志在桌面上放宽，校准页保持窄栏（文字要一行读得完）
  const wide =
    state.screen === 'start' ||
    state.screen === 'select' ||
    state.screen === 'game' ||
    state.screen === 'devlog';

  return (
    <div className="flex min-h-dvh flex-col">
      <main
        className={`mx-auto flex w-full flex-1 flex-col px-5 py-8 sm:px-8 sm:py-12 ${
          wide ? 'max-w-7xl' : 'max-w-3xl'
        }`}
      >
        {state.screen === 'start' ? (
          <StartScreen
            hasCalibration={state.calibrated}
            onStartCamera={() => send({ type: 'choose_camera' })}
            onRecalibrate={() => send({ type: 'start_calibration' })}
            onStartDemo={() => send({ type: 'choose_demo' })}
            onOpenDevlog={() => send({ type: 'open_devlog' })}
          />
        ) : null}

        {state.screen === 'devlog' ? (
          <DevlogScreen onBack={() => send({ type: 'home' })} />
        ) : null}

        {state.screen === 'calibration' ? (
          <CalibrationScreen
            onBack={() => send({ type: 'home' })}
            onFinish={finishCalibration}
            onDemo={() => send({ type: 'choose_demo' })}
          />
        ) : null}

        {state.screen === 'select' ? (
          <SelectScreen
            onPick={(game) => send({ type: 'pick_game', game })}
            onBack={() => send({ type: 'home' })}
          />
        ) : null}

        {state.screen === 'game' ? (
          <GameScreen
            gameId={state.gameId}
            mode={state.mode}
            calibration={calibration}
            onBack={() => send({ type: 'home' })}
            onDemo={() => send({ type: 'choose_demo' })}
            onSwitchGame={() => send({ type: 'switch_game' })}
          />
        ) : null}

        {saveNotice ? (
          <p role="status" aria-live="polite" className="mt-6 text-lg font-semibold text-accent">
            {saveNotice}
          </p>
        ) : null}
      </main>

      <footer className="mx-auto w-full max-w-7xl px-5 pb-8 text-base text-dim sm:px-8">
        零触控游乐场 · 纯前端，无账号、无后端、不上传任何画面
      </footer>
    </div>
  );
}
