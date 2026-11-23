import type { GameId } from '../state/machine';

/**
 * 最佳成绩，存 zt.best.v1 —— 和校准/设置的两条记录互不相干，schema 独立演进。
 * 坏数据当没有，写不进（私密模式）也正常玩，只是不记忆。
 */

export const BEST_KEY = 'zt.best.v1';

export interface BestScores {
  star: number | null;
  rhythm: number | null;
}

export const EMPTY_BEST: BestScores = { star: null, rhythm: null };

function readScore(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function parseBestScores(raw: string | null): BestScores {
  if (raw === null) return EMPTY_BEST;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return EMPTY_BEST;
    }
    const rec = parsed as Record<string, unknown>;
    return {
      star: readScore(rec.star),
      rhythm: readScore(rec.rhythm),
    };
  } catch {
    return EMPTY_BEST;
  }
}

export function serializeBestScores(scores: BestScores): string {
  return JSON.stringify(scores);
}

export function bestOf(scores: BestScores, game: GameId): number | null {
  return scores[game];
}

/** 新成绩更大才记；返回新对象，不碰入参。 */
export function updateBest(scores: BestScores, game: GameId, score: number): BestScores {
  const prev = scores[game];
  if (prev !== null && prev >= score) return scores;
  return { ...scores, [game]: score };
}

export function readBestScores(): BestScores {
  try {
    return parseBestScores(globalThis.localStorage?.getItem(BEST_KEY) ?? null);
  } catch {
    return EMPTY_BEST;
  }
}

export function writeBestScores(scores: BestScores): boolean {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    storage.setItem(BEST_KEY, serializeBestScores(scores));
    return true;
  } catch {
    return false;
  }
}

/** 记一次成绩：新纪录写盘，返回「更新后的最佳分」。 */
export function recordScore(game: GameId, score: number): number {
  const scores = readBestScores();
  const prev = bestOf(scores, game);
  if (prev === null || score > prev) {
    writeBestScores(updateBest(scores, game, score));
    return score;
  }
  return prev;
}
