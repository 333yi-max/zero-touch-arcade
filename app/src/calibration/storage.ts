import { DEFAULT_CONFIG, clamp } from '../input/config';
import type { Calibration } from '../input/types';
import type { CalibrationResult } from './result';

/**
 * 校准值落盘。存的就是 4 个数字加两个元数据字段 —— 没有图像、没有视频、没有帧，
 * 这条用 STORAGE_KEYS 那条测试锁死。
 */
export type StoredCalibration = {
  v: 1;
  yawNeutral: number;
  pitchNeutral: number;
  yawRange: number;
  pitchRange: number;
  savedAt: number;
};

export type StoredSettings = { voice: boolean };

/** 版本号编进 key：schema 一改就换 key，旧记录自然失效，不需要迁移代码。 */
export const CALIBRATION_KEY = 'zt.calibration.v1';
export const SETTINGS_KEY = 'zt.settings.v1';

/** 隐私断言用：序列化后的键集合必须恰好是这些。 */
export const STORAGE_KEYS: readonly string[] = [
  'pitchNeutral',
  'pitchRange',
  'savedAt',
  'v',
  'yawNeutral',
  'yawRange',
];

const MAX_NEUTRAL = 0.5;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function isValidStoredCalibration(x: unknown): x is StoredCalibration {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  return (
    o.v === 1 &&
    isFiniteNumber(o.yawNeutral) &&
    isFiniteNumber(o.pitchNeutral) &&
    isFiniteNumber(o.yawRange) &&
    isFiniteNumber(o.pitchRange)
  );
}

/** 纯解析：结构不对就 null，绝不猜；数值越界按钳位收敛（自己写的数据，越界只可能是手改）。 */
export function parseStoredCalibration(raw: string | null | undefined): StoredCalibration | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isValidStoredCalibration(parsed)) return null;
  const c = parsed as StoredCalibration;
  if (Math.abs(c.yawNeutral) > MAX_NEUTRAL || Math.abs(c.pitchNeutral) > MAX_NEUTRAL) return null;
  return {
    v: 1,
    yawNeutral: c.yawNeutral,
    pitchNeutral: c.pitchNeutral,
    yawRange: clamp(c.yawRange, DEFAULT_CONFIG.rangeMin, DEFAULT_CONFIG.rangeMax),
    pitchRange: clamp(c.pitchRange, DEFAULT_CONFIG.pitchRangeMin, DEFAULT_CONFIG.pitchRangeMax),
    savedAt: isFiniteNumber(c.savedAt) ? c.savedAt : 0,
  };
}

export function serializeStoredCalibration(c: StoredCalibration): string {
  return JSON.stringify(c);
}

export function toStoredCalibration(r: CalibrationResult, savedAt: number): StoredCalibration {
  return {
    v: 1,
    yawNeutral: r.yawNeutral,
    pitchNeutral: r.pitchNeutral,
    yawRange: r.yawRange,
    pitchRange: r.pitchRange,
    savedAt,
  };
}

/** 落盘形状 → 引擎形状。 */
export function fromStoredCalibration(c: StoredCalibration): Required<Calibration> {
  return {
    yawNeutral: c.yawNeutral,
    pitchNeutral: c.pitchNeutral,
    range: c.yawRange,
    pitchRange: c.pitchRange,
  };
}

export function parseStoredSettings(raw: string | null | undefined): StoredSettings | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const voice = (parsed as Record<string, unknown>).voice;
  return typeof voice === 'boolean' ? { voice } : null;
}

export function serializeStoredSettings(
  s: StoredSettings,
  base: Record<string, unknown> = {},
): string {
  // 同一条记录里还住着游戏音效开关（playerPrefs 写的 muted）。这里只覆盖 voice，
  // 其余字段原样保留 —— 否则在校准页切一次语音，游戏页的静音设置就被冲掉。
  return JSON.stringify({ ...base, voice: s.voice });
}

// ———— 下面是这个模块唯一碰 DOM 的一层 ————

/** 浏览器禁用存储时，访问 localStorage 本身就是抛错，不是返回 undefined。 */
function store(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function getItem(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function setItem(key: string, value: string): boolean {
  const s = store();
  if (!s) return false;
  try {
    s.setItem(key, value);
    return true;
  } catch {
    // Safari 私密模式：能读能写但立刻抛，不能让它把校准流程带崩
    return false;
  }
}

export function readStoredCalibration(): StoredCalibration | null {
  return parseStoredCalibration(getItem(CALIBRATION_KEY));
}

export function writeStoredCalibration(c: StoredCalibration): boolean {
  return setItem(CALIBRATION_KEY, serializeStoredCalibration(c));
}

export function clearStoredCalibration(): void {
  try {
    store()?.removeItem(CALIBRATION_KEY);
  } catch {
    /* 存不了也没什么可清的 */
  }
}

/** 语音默认开：目标用户里不少人看不清小字。 */
export function readStoredSettings(): StoredSettings {
  return parseStoredSettings(getItem(SETTINGS_KEY)) ?? { voice: true };
}

export function writeStoredSettings(s: StoredSettings): boolean {
  let base: Record<string, unknown> = {};
  const raw = getItem(SETTINGS_KEY);
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        base = parsed as Record<string, unknown>;
      }
    } catch {
      base = {};
    }
  }
  return setItem(SETTINGS_KEY, serializeStoredSettings(s, base));
}
