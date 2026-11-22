import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { CameraSource } from '../input/cameraSource';
import type { RawFrame } from '../input/types';
import {
  advance,
  blinksLeft,
  initialCalibration,
  liveReadout,
  progressOf,
  type CalState,
  type LiveReadout,
} from '../calibration/sequencer';
import { buildCalibration, type CalibrationResult } from '../calibration/result';
import { readStoredSettings, writeStoredSettings } from '../calibration/storage';
import { SPEECH_SETTINGS, createSpeaker, speechFor, type Speaker } from '../calibration/speech';

export interface CalibrationController {
  state: CalState;
  /** 走完并采到数才非 null；「用默认值继续」是 null，App 据此决定写不写盘。 */
  result: CalibrationResult | null;
  usedDefaults: boolean;
  live: LiveReadout;
  progress: number;
  blinksLeft: number;
  frame: RawFrame | null;
  source: CameraSource | null;
  error: string | null;
  voiceEnabled: boolean;
  toggleVoice: () => void;
  redoStep: () => void;
  useDefaults: () => void;
  /** 摘要页的「重新校准」：整条流程回到第 1 步起点 */
  restart: () => void;
}

/**
 * 校准页的 DOM 外壳：摄像头生命周期、帧→reducer、语音、空格。
 * 判定和数值全在纯模块里，这里只做接线，所以流程本身是能在 node 里测的。
 */
export function useCalibration(
  videoRef: RefObject<HTMLVideoElement | null>,
): CalibrationController {
  const [state, dispatch] = useReducer(advance, initialCalibration);
  const [source, setSource] = useState<CameraSource | null>(null);
  const [frame, setFrame] = useState<RawFrame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(() => readStoredSettings().voice);

  const speakerRef = useRef<Speaker | null>(null);
  if (speakerRef.current === null) speakerRef.current = createSpeaker();

  const voiceRef = useRef(voiceEnabled);
  useEffect(() => {
    voiceRef.current = voiceEnabled;
  }, [voiceEnabled]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const camera = new CameraSource(video, (resumeError) => setError(resumeError.message));
    camera.onFrame((raw) => {
      setFrame(raw);
      dispatch({
        type: 'frame',
        yaw: raw.yaw,
        pitch: raw.pitch,
        // 和引擎同一个定义：双眼都闭上才算眨眼
        blink: Math.min(raw.blinkL, raw.blinkR),
        t: raw.t,
        present: raw.present,
      });
    });
    setSource(camera);
    setError(null);
    camera.start().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => {
      setSource(null);
      camera.dispose();
    };
  }, [videoRef]);

  // 每步念一次指令；同一步自动重采时换说法。第 1 步把欢迎语并进来，
  // 免得单独播一句被下一步的 cancel() 掐掉。
  const speechKey = `${state.step}:${state.attempt}:${state.finished ?? 'run'}`;
  useEffect(() => {
    const speaker = speakerRef.current;
    if (!speaker || !voiceRef.current || state.finished === null) return;
    const first = state.step === 'neutral' && state.attempt === 1;
    speaker.speak(
      `${first ? SPEECH_SETTINGS.welcome : ''}${speechFor(state.step, state.attempt)}`,
    );
  }, [speechKey, state.step, state.attempt, state.finished]);

  useEffect(() => {
    const speaker = speakerRef.current;
    if (state.finished === 'measured') speaker?.speak(SPEECH_SETTINGS.done);
    if (state.finished === 'defaults') speaker?.speak(SPEECH_SETTINGS.defaults);
  }, [state.finished]);

  useEffect(() => {
    const speaker = speakerRef.current;
    return () => speaker?.cancel();
  }, []);

  // 空格兜底：reducer 自己只在眨眼确认那一步认这个动作。
  // 焦点在按钮上时空格是给按钮的，不抢。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ' && event.code !== 'Space') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(button|input|textarea|select|a)$/i.test(target.tagName)) return;
      event.preventDefault();
      dispatch({ type: 'manualConfirm' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const result = useMemo(
    () => (state.finished === 'measured' ? buildCalibration(state.measurements) : null),
    [state.finished, state.measurements],
  );

  const toggleVoice = useCallback((): void => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    writeStoredSettings({ voice: next });
    const speaker = speakerRef.current;
    if (!speaker) return;
    if (next) speaker.speak(SPEECH_SETTINGS.on);
    else speaker.cancel();
  }, [voiceEnabled]);

  const redoStep = useCallback((): void => dispatch({ type: 'redoStep' }), []);
  const useDefaults = useCallback((): void => dispatch({ type: 'useDefaults' }), []);
  const restart = useCallback((): void => dispatch({ type: 'reset' }), []);

  return {
    state,
    result,
    usedDefaults: state.finished === 'defaults',
    live: liveReadout(state, frame ?? { yaw: 0, pitch: 0 }),
    progress: progressOf(state),
    blinksLeft: blinksLeft(state),
    frame,
    source,
    error,
    voiceEnabled,
    toggleVoice,
    redoStep,
    useDefaults,
    restart,
  };
}
