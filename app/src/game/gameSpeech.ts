import { createSpeaker } from '../calibration/speech';
import type { Rating } from './rhythmGame';
import type { GameOverCause } from './starGame';

/** 游戏里的语音播报，复用校准页的 speechSynthesis 薄壳。 */
export const GAME_SPEECH = {
  countdown: '准备，转头控制挡板。',
  paused: '已暂停。张嘴或点头继续。',
  resumed: '继续。',
  gameOver: '本局结束。',
  timeUp: '时间到。',
  rhythmCountdown: '准备，跟着节拍点头。',
  rhythmDone: '完成！',
} as const;

export interface GameSpeaker {
  countdown(): void;
  paused(): void;
  resumed(): void;
  gameOver(cause: GameOverCause, score: number): void;
  rhythmCountdown(): void;
  rhythmGameOver(rating: Rating, score: number): void;
}

export function createGameSpeaker(): GameSpeaker {
  const speaker = createSpeaker();
  return {
    countdown: () => speaker.speak(GAME_SPEECH.countdown),
    paused: () => speaker.speak(GAME_SPEECH.paused),
    resumed: () => speaker.speak(GAME_SPEECH.resumed),
    gameOver: (cause, score) =>
      speaker.speak(`${cause === 'time' ? GAME_SPEECH.timeUp : GAME_SPEECH.gameOver}得分 ${score}。`),
    rhythmCountdown: () => speaker.speak(GAME_SPEECH.rhythmCountdown),
    rhythmGameOver: (rating, score) =>
      speaker.speak(`${GAME_SPEECH.rhythmDone}得分 ${score}。评级 ${rating}。`),
  };
}
