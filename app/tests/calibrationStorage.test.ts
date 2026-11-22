import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_KEY,
  SETTINGS_KEY,
  STORAGE_KEYS,
  isValidStoredCalibration,
  parseStoredCalibration,
  parseStoredSettings,
  readStoredCalibration,
  readStoredSettings,
  serializeStoredCalibration,
  toStoredCalibration,
  writeStoredCalibration,
  writeStoredSettings,
  type StoredCalibration,
} from '../src/calibration/storage';
import { defaultCalibration } from '../src/calibration/result';

function sample(over: Partial<StoredCalibration> = {}): StoredCalibration {
  return {
    v: 1,
    yawNeutral: 0.02,
    pitchNeutral: 0.01,
    yawRange: 0.22,
    pitchRange: 0.18,
    savedAt: 1_700_000_000_000,
    ...over,
  };
}

/** node 里没有 localStorage；要验读写就自己塞一个。 */
function withStorage(
  stub: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void },
  run: () => void,
): void {
  const g = globalThis as { localStorage?: unknown };
  const prev = g.localStorage;
  g.localStorage = stub;
  try {
    run();
  } finally {
    if (prev === undefined) delete g.localStorage;
    else g.localStorage = prev;
  }
}

function memoryStore(): {
  items: Map<string, string>;
  api: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
} {
  const items = new Map<string, string>();
  return {
    items,
    api: {
      getItem: (k) => items.get(k) ?? null,
      setItem: (k, v) => void items.set(k, v),
      removeItem: (k) => void items.delete(k),
    },
  };
}

describe('calibration/storage', () => {
  it('往返一致：写进去什么读出来什么', () => {
    const c = sample();
    expect(parseStoredCalibration(serializeStoredCalibration(c))).toEqual(c);
  });

  it('隐私：序列化后只有 6 个键，没有任何图像/视频/帧字段的位置', () => {
    const keys = Object.keys(JSON.parse(serializeStoredCalibration(sample()))).sort();
    expect(keys).toEqual([...STORAGE_KEYS].sort());
  });

  it('坏数据一律判 null，不猜', () => {
    expect(parseStoredCalibration(null)).toBeNull();
    expect(parseStoredCalibration('')).toBeNull();
    expect(parseStoredCalibration('{不是 json')).toBeNull();
    expect(parseStoredCalibration('[]')).toBeNull();
    expect(parseStoredCalibration('null')).toBeNull();
    expect(parseStoredCalibration('"字符串"')).toBeNull();
    // 版本号不对 —— 老 schema 宁可让人重校一次，也不拿 range 冒充 pitchRange
    expect(parseStoredCalibration(serializeStoredCalibration(sample({ v: 2 as unknown as 1 })))).toBeNull();
    expect(parseStoredCalibration(serializeStoredCalibration({ ...sample(), pitchRange: undefined } as unknown as StoredCalibration))).toBeNull();
  });

  it('非有限数、越界中性位都拒绝', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, '0.22', true, null]) {
      const raw = JSON.stringify({ ...sample(), yawRange: bad });
      expect(parseStoredCalibration(raw)).toBeNull();
    }
    expect(parseStoredCalibration(serializeStoredCalibration(sample({ yawNeutral: 3.5 })))).toBeNull();
    expect(isValidStoredCalibration(sample({ pitchNeutral: Number.NaN }))).toBe(false);
  });

  it('量程越界按钳位收敛，不丢档', () => {
    expect(parseStoredCalibration(serializeStoredCalibration(sample({ yawRange: 0.9 })))!.yawRange).toBe(0.22);
    expect(parseStoredCalibration(serializeStoredCalibration(sample({ yawRange: 0.001 })))!.yawRange).toBe(0.08);
    expect(parseStoredCalibration(serializeStoredCalibration(sample({ pitchRange: 0.01 })))!.pitchRange).toBe(0.06);
  });

  it('savedAt 坏了不影响可用性', () => {
    expect(parseStoredCalibration(serializeStoredCalibration(sample({ savedAt: Number.NaN })))!.savedAt).toBe(0);
  });

  it('node 环境没有 localStorage：读 null、写 false、不抛', () => {
    expect(readStoredCalibration()).toBeNull();
    expect(writeStoredCalibration(sample())).toBe(false);
    expect(readStoredSettings()).toEqual({ voice: true });
  });

  it('写进去能读回来；setItem 抛错（Safari 私密模式）时返回 false 且不冒泡', () => {
    const { items, api } = memoryStore();
    withStorage(api, () => {
      expect(writeStoredCalibration(toStoredCalibration(defaultCalibration(), 123))).toBe(true);
      expect(items.get(CALIBRATION_KEY)).toBeTypeOf('string');
      expect(readStoredCalibration()!.savedAt).toBe(123);
      expect(writeStoredSettings({ voice: false })).toBe(true);
      expect(readStoredSettings()).toEqual({ voice: false });
      expect(items.get(SETTINGS_KEY)).toBe('{"voice":false}');
    });

    withStorage(
      {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
        removeItem: () => {},
      },
      () => {
        expect(writeStoredCalibration(sample())).toBe(false);
        expect(writeStoredSettings({ voice: true })).toBe(false);
      },
    );
  });

  it('parseStoredSettings 只认布尔 voice', () => {
    expect(parseStoredSettings('{"voice":"yes"}')).toBeNull();
    expect(parseStoredSettings('{"voice":true}')).toEqual({ voice: true });
    expect(parseStoredSettings('{"voice":1}')).toBeNull();
    expect(parseStoredSettings('[]')).toBeNull();
  });
});
