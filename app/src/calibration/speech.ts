import { STEP_COPY, type StepId } from './steps';

export type SpeechKey = StepId | 'confirm';

/**
 * 播报文本：屏幕上的字和念出来的话同源，改一处不会两边不一致。
 * attempt 2 换说法，但指令本身一个字不改——同一步重做不该听到两套描述。
 */
export function speechFor(step: SpeechKey, attempt: 1 | 2 = 1): string {
  const copy = STEP_COPY[step];
  const lead = attempt === 2 ? '没感觉到，再来一次。' : '';
  return `${lead}${copy.title}。${copy.detail}`;
}

export const SPEECH_SETTINGS = {
  on: '语音播报已打开',
  off: '语音播报已关闭',
  welcome: '欢迎来到校准。跟着提示做就行，全程大约 15 秒。',
  done: '校准完成。',
  defaults: '已用默认量程继续，随时可以重新校准。',
} as const;

export type Speaker = {
  speak(text: string): void;
  cancel(): void;
  available(): boolean;
};

/**
 * speechSynthesis 薄壳。
 *
 * Windows 上没装中文语音包时 getVoices() 里不会有 zh 声线，这里不哑掉也不抛错：
 * 照样用默认声线念，只是发音不准。念不出来不该成为卡住校准的理由。
 */
export function createSpeaker(): Speaker {
  const synth = typeof globalThis.speechSynthesis === 'undefined' ? null : globalThis.speechSynthesis;
  let cached: SpeechSynthesisVoice | null = null;

  const pickVoice = (): SpeechSynthesisVoice | null => {
    if (cached) return cached;
    if (!synth) return null;
    try {
      const found = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('zh')) ?? null;
      // 语音包是异步加载的，这次没找到下次再找，不缓存 null
      if (found) cached = found;
      return found;
    } catch {
      return null;
    }
  };

  return {
    available: () => synth !== null,
    speak(text: string): void {
      if (!synth || text.length === 0) return;
      try {
        // 切步时上一句还没念完，先掐掉，不然两句话叠着念
        synth.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        const voice = pickVoice();
        if (voice) utterance.voice = voice;
        synth.speak(utterance);
      } catch {
        /* 浏览器拒绝播报就只走屏幕文字 */
      }
    },
    cancel(): void {
      try {
        synth?.cancel();
      } catch {
        /* 同上 */
      }
    },
  };
}
