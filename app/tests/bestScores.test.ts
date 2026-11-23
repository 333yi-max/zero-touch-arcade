import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_BEST,
  bestOf,
  parseBestScores,
  readBestScores,
  recordScore,
  serializeBestScores,
  updateBest,
  writeBestScores,
} from '../src/game/bestScores';

describe('game/bestScores', () => {
  it('parse：null 和坏 JSON 都当没有', () => {
    expect(parseBestScores(null)).toEqual(EMPTY_BEST);
    expect(parseBestScores('{oops')).toEqual(EMPTY_BEST);
    expect(parseBestScores('"str"')).toEqual(EMPTY_BEST);
    expect(parseBestScores('[1,2]')).toEqual(EMPTY_BEST);
  });

  it('parse：字段类型不对只丢掉那个字段', () => {
    expect(parseBestScores('{"star":120,"rhythm":"高"}')).toEqual({ star: 120, rhythm: null, snake: null });
    expect(parseBestScores('{"star":-1}')).toEqual({ star: null, rhythm: null, snake: null });
  });

  it('serialize/parse 往返一致', () => {
    const scores = { star: 410, rhythm: 1400, snake: 980 };
    expect(parseBestScores(serializeBestScores(scores))).toEqual(scores);
  });

  it('updateBest：更高才换，否则原样返回；不碰入参', () => {
    const base = { star: 100, rhythm: null, snake: null };
    expect(updateBest(base, 'star', 90)).toBe(base);
    expect(updateBest(base, 'star', 100)).toBe(base);
    const up = updateBest(base, 'rhythm', 200);
    expect(up).toEqual({ star: 100, rhythm: 200, snake: null });
    expect(base.rhythm).toBeNull();
  });

  it('bestOf 按游戏取', () => {
    expect(bestOf({ star: 3, rhythm: null, snake: 8 }, 'star')).toBe(3);
    expect(bestOf({ star: 3, rhythm: null, snake: 8 }, 'rhythm')).toBeNull();
    expect(bestOf({ star: 3, rhythm: null, snake: 8 }, 'snake')).toBe(8);
  });
});

describe('game/bestScores · localStorage', () => {
  let store: Map<string, string>;
  const original = globalThis.localStorage;

  beforeEach(() => {
    store = new Map();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    };
  });

  afterEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = original;
  });

  it('recordScore：新纪录写盘并返回，更低的成绩不动盘', () => {
    expect(recordScore('star', 120)).toBe(120);
    expect(recordScore('star', 90)).toBe(120);
    expect(readBestScores()).toEqual({ star: 120, rhythm: null, snake: null });
  });

  it('盘里有坏数据也不崩，照常记', () => {
    store.set('zt.best.v1', '{"star":"坏"}');
    expect(readBestScores()).toEqual(EMPTY_BEST);
    expect(recordScore('rhythm', 1400)).toBe(1400);
    expect(readBestScores()).toEqual({ star: null, rhythm: 1400, snake: null });
  });

  it('写不进（无 localStorage）也不影响返回新分', () => {
    (globalThis as { localStorage?: unknown }).localStorage = undefined;
    expect(recordScore('star', 50)).toBe(50);
    expect(writeBestScores({ star: 1, rhythm: 2, snake: null })).toBe(false);
  });
});
