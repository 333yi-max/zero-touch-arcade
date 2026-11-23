/**
 * 截图验收脚本：puppeteer-core 驱动系统 Edge，真页面截图 + 网络/控制台巡检。
 *
 * 用法（在 app/ 目录）：
 *   node scripts/shots.mjs "53|home|1280x800" "54|select|375x812" [--reduced]
 *   - 每个 spec = 编号|路由|宽x高，路由见 ROUTES
 *   - --reduced 模拟 prefers-reduced-motion: reduce
 *   - 页面出现任何 4xx/5xx 响应或 console error 即退出码 1
 *   - 截图输出到 docs/shots/<编号>-<路由>[-reduced].png
 * 需要先起 dev server（默认 http://localhost:5199，可用 SHOTS_URL 覆盖）。
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = resolve(__dirname, '../../docs/shots');
const BASE = process.env.SHOTS_URL ?? 'http://localhost:5199/';
const REDUCED = process.argv.includes('--reduced');

const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

/** 路由 = 从首页出发要点的按钮文本序列（按 textContent 包含匹配）。 */
const ROUTES = {
  home: [],
  devlog: [['开发日志']],
  select: [['演示模式']],
  'game-star': [['演示模式'], ['接星星']],
  'game-rhythm': [['演示模式'], ['节奏点头']],
  'game-snake': [['演示模式'], ['霓虹贪吃蛇']],
  'game-whack': [['演示模式'], ['打地鼠']],
  // 虚拟玩家开局第一帧就在点头，「开始游戏」按钮转瞬即逝 → 一律 WAIT 等它自己开局
  'game-star-playing': [['演示模式'], ['接星星'], ['WAIT:5000']],
  'game-snake-playing': [['演示模式'], ['霓虹贪吃蛇'], ['WAIT:6000']],
  // 节奏点头演示玩家自己点头开局，等倒计时走完进对局再拍
  'game-rhythm-playing': [['演示模式'], ['节奏点头'], ['WAIT:5000']],
  // 打地鼠演示玩家会自己点头开局，等它打完倒计时进入对局再拍
  'game-whack-playing': [['演示模式'], ['打地鼠'], ['WAIT:6500']],
  // 吹蜡烛演示玩家自己点头开局（挂载后 1.5 秒）+ 3 秒倒计时，对局中期拍
  'game-candle': [['演示模式'], ['吹蜡烛']],
  'game-candle-playing': [['演示模式'], ['吹蜡烛'], ['WAIT:7500']],
  // 演示玩家 1.5s 点头 + 3s 倒计时 + ~5.6s 吹完 → 结果卡
  'game-candle-over': [['演示模式'], ['吹蜡烛'], ['WAIT:11500']],
  // 结果卡：接星星 5 颗漏星（第 5 颗在 id 149 ≈ 112s）+ 开局/倒计时
  'game-star-over': [['演示模式'], ['接星星'], ['WAIT:125000']],
  // 结果卡：节奏点头 16 拍约 20s + 3s 倒计时
  'game-rhythm-over': [['演示模式'], ['节奏点头'], ['WAIT:28000']],
  // 结果卡：贪吃蛇 90s 到时间 + 倒计时/开局
  'game-snake-over': [['演示模式'], ['霓虹贪吃蛇'], ['WAIT:98000']],
  // 结果卡：打地鼠敲满 25 个约 21s + 开局/倒计时
  'game-whack-over': [['演示模式'], ['打地鼠'], ['WAIT:32000']],
};

function specsFromArgs(argv) {
  const specs = [];
  for (const a of argv) {
    if (a.startsWith('--')) continue;
    const [num, route, size] = a.split('|');
    if (!num || !route || !size || !ROUTES[route]) {
      console.error(`坏 spec: ${a}（要 编号|路由|宽x高，可用路由: ${Object.keys(ROUTES).join(', ')}）`);
      process.exit(1);
    }
    specs.push({ num, route, size });
  }
  return specs;
}

async function clickByText(page, text) {
  const ok = await page.evaluate((t) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    // 首选按钮文案直接命中；选游戏页卡片按钮文案是「开始」，退回按卡片标题找
    let b = buttons.find((x) => (x.textContent ?? '').includes(t));
    if (!b) {
      const card = Array.from(document.querySelectorAll('article')).find(
        (x) => (x.textContent ?? '').includes(t),
      );
      b = card ? card.querySelector('button') : null;
    }
    if (!b) return false;
    b.scrollIntoView({ block: 'center' });
    b.click();
    return true;
  }, text);
  if (!ok) throw new Error(`找不到按钮: ${text}`);
  await new Promise((r) => setTimeout(r, 250));
}

async function main() {
  const specs = specsFromArgs(process.argv.slice(2));
  if (specs.length === 0) {
    console.error('没有 spec，示例: node scripts/shots.mjs "53|home|1280x800"');
    process.exit(1);
  }
  const edge = EDGE_PATHS.find((p) => existsSync(p)) ?? process.env.EDGE_PATH;
  if (!edge) {
    console.error('找不到 Edge，设置 EDGE_PATH 指向 msedge.exe');
    process.exit(1);
  }

  const failures = [];
  const browser = await puppeteer.launch({ executablePath: edge, headless: true });
  const page = await browser.newPage();
  page.on('response', (res) => {
    if (res.status() >= 400) failures.push(`HTTP ${res.status()} ${res.url()}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') failures.push(`console.error: ${msg.text().slice(0, 160)}`);
  });
  if (REDUCED) {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  }
  mkdirSync(SHOTS_DIR, { recursive: true });

  for (const { num, route, size } of specs) {
    const [w, h] = size.split('x').map(Number);
    await page.setViewport({ width: w, height: h });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    for (const [text] of ROUTES[route]) {
      if (text.startsWith('WAIT:')) {
        await new Promise((r) => setTimeout(r, Number(text.slice(5))));
        continue;
      }
      await clickByText(page, text);
    }
    try {
      await page.waitForNetworkIdle({ idleTime: 400, timeout: 8000 });
    } catch {
      // dev server 的 HMR websocket 可能挡住 idle 判定，超时不算失败
    }
    await new Promise((r) => setTimeout(r, 400));
    const file = join(SHOTS_DIR, `${num}-${route}${REDUCED ? '-reduced' : ''}.png`);
    await page.screenshot({ path: file });
    console.log(`已保存 ${file}（${w}x${h}）`);
  }

  await browser.close();

  if (failures.length > 0) {
    console.error('验收失败：');
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log('网络 4xx/5xx = 0，console error = 0 ✅');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
