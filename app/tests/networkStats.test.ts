import { describe, expect, it } from 'vitest';
import { countExternalResources } from '../src/game/networkStats';

const BASE = 'https://zt.example.com';

describe('game/networkStats', () => {
  it('同源资源不计，站外域名逐个计', () => {
    expect(countExternalResources([], BASE)).toBe(0);
    expect(
      countExternalResources(
        [
          { name: 'https://zt.example.com/assets/app.js' },
          { name: 'https://zt.example.com/model/face.wasm' },
          { name: '/relative/path.js' },
        ],
        BASE,
      ),
    ).toBe(0);
    expect(
      countExternalResources(
        [
          { name: 'https://zt.example.com/assets/app.js' },
          { name: 'https://cdn.other.com/lib.js' },
          { name: 'https://stats.tracker.net/pixel' },
        ],
        BASE,
      ),
    ).toBe(2);
  });

  it('data: 与 blob: 条目不算外部', () => {
    expect(countExternalResources([{ name: 'data:image/png;base64,xx' }, { name: 'blob:https://zt.example.com/x' }], BASE)).toBe(0);
  });

  it('解析不了的条目直接跳过，不崩', () => {
    expect(countExternalResources([{ name: 'not a url at all' }, { name: 'https://ok.example.com/a' }], BASE)).toBe(1);
  });
});
