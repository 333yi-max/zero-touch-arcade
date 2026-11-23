import {
  BEATS,
  beatAtMs,
  type RhythmGameInput,
  type RhythmGameState,
} from './rhythmGame';

/**
 * 演示模式的虚拟打拍：ready 里先点头开局，playing 后每拍 ±60ms 内点头，
 * 跳过第 4、第 11 拍（索引 3、10）→ 14/16 命中 = 87.5%，评级 A。
 * 纯函数：confirm 只在拍点目标时刻及之后那一帧为 true，配合 state.prevConfirm 自然成上升沿。
 */
const SKIP_BEATS = new Set([3, 10]);

export function demoRhythmInput(
  _raw: RhythmGameInput,
  state: RhythmGameState,
): RhythmGameInput {
  if (state.phase === 'ready') return { confirm: true };
  if (state.phase !== 'playing') return { confirm: false };
  const beat = state.beatIndex;
  if (beat >= BEATS || SKIP_BEATS.has(beat)) return { confirm: false };
  // 奇偶拍错开 ±40ms，肉眼看起来像真人，判定上全是 perfect
  const offset = beat % 2 === 0 ? -40 : 40;
  return { confirm: state.elapsedMs >= beatAtMs(beat) + offset };
}
