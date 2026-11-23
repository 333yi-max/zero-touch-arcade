/**
 * 玩家偏好设置（音效开关），和校准模块共用 zt.settings.v1 这条记录：
 * 只增不改 —— voice 字段原样保留，这里只读写 muted。
 * 解析失败当默认值，写不进（私密模式）也照常玩，只是不记忆。
 */

const KEY = 'zt.settings.v1';

function getItem(): string | null {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

/** 音效默认开：听障用户可以关，但第一次进来要有反馈。 */
export function readMuted(): boolean {
  const raw = getItem();
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return typeof parsed?.muted === 'boolean' ? parsed.muted : false;
  } catch {
    return false;
  }
}

export function writeMuted(muted: boolean): boolean {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(storage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    } catch {
      parsed = {};
    }
    parsed.muted = muted;
    storage.setItem(KEY, JSON.stringify(parsed));
    return true;
  } catch {
    return false;
  }
}
