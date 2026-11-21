import { useReducer } from 'react';
import CalibrationScreen from './components/CalibrationScreen';
import GameScreen from './components/GameScreen';
import ResultScreen from './components/ResultScreen';
import StartScreen from './components/StartScreen';
import { initialState, next } from './state/machine';

export default function App() {
  const [state, send] = useReducer(next, initialState);

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-8 sm:py-12">
        {state.screen === 'start' ? (
          <StartScreen
            onStartCamera={() => send({ type: 'choose_camera' })}
            onStartDemo={() => send({ type: 'choose_demo' })}
          />
        ) : null}

        {state.screen === 'calibration' ? (
          <CalibrationScreen
            onBack={() => send({ type: 'home' })}
            onFinish={() => send({ type: 'calibration_finished' })}
            onSkip={() => send({ type: 'calibration_skipped' })}
          />
        ) : null}

        {state.screen === 'game' ? (
          <GameScreen
            mode={state.mode}
            onBack={() => send({ type: 'home' })}
            onFinish={(score) => send({ type: 'game_finished', score })}
          />
        ) : null}

        {state.screen === 'result' ? (
          <ResultScreen
            score={state.score}
            mode={state.mode}
            onReplay={() => send({ type: 'replay' })}
            onHome={() => send({ type: 'home' })}
          />
        ) : null}
      </main>

      <footer className="mx-auto w-full max-w-3xl px-5 pb-8 text-base text-dim">
        零触控游乐场 · 纯前端，无账号、无后端、不上传任何画面
      </footer>
    </div>
  );
}
