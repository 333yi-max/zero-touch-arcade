import type { GameId } from '../state/machine';

/**
 * 分享卡：1080×1440 PNG，全部用 Canvas 路径画出来 —— 不引图片、不引字体文件。
 * drawShareCard 是纯函数（单测用假 ctx 断言绘制命令），浏览器动作全在 downloadShareCard 里。
 */

export const SHARE_WIDTH = 1080;
export const SHARE_HEIGHT = 1440;
/** 中文走系统字体栈：没有装任何字体也能用浏览器兜底渲染，不乱码。 */
export const FONT_STACK = "'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";

export interface ShareCardData {
  game: GameId;
  score: number;
  date: Date;
}

const GAME_NAMES: Record<GameId, string> = {
  star: '接星星',
  rhythm: '节奏点头',
  snake: '霓虹贪吃蛇',
  whack: '打地鼠',
};

const BG_TOP = '#0a0f1f';
const BG_BOTTOM = '#16203c';
const FG = '#f2f5fc';
const DIM = '#8b96b8';
const ACCENT = '#ffd60a';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function shareCardFileName(date: Date): string {
  return `zero-touch-score-${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}.png`;
}

function localDateLabel(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 纯绘制：只写字和几何图形，颜色/尺寸全在模块常量里。 */
export function drawShareCard(ctx: CanvasRenderingContext2D, data: ShareCardData): void {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const bg = ctx.createLinearGradient(0, 0, 0, SHARE_HEIGHT);
  bg.addColorStop(0, BG_TOP);
  bg.addColorStop(1, BG_BOTTOM);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT);

  // 细边框，像一张票
  ctx.strokeStyle = 'rgba(88,196,255,0.35)';
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, SHARE_WIDTH - 80, SHARE_HEIGHT - 80);

  ctx.fillStyle = DIM;
  ctx.font = `44px ${FONT_STACK}`;
  ctx.fillText('零触控游乐场', SHARE_WIDTH / 2, 130);

  ctx.fillStyle = FG;
  ctx.font = `900 92px ${FONT_STACK}`;
  ctx.fillText(GAME_NAMES[data.game], SHARE_WIDTH / 2, 240);

  ctx.fillStyle = DIM;
  ctx.font = `48px ${FONT_STACK}`;
  ctx.fillText('得分', SHARE_WIDTH / 2, 560);

  ctx.fillStyle = ACCENT;
  ctx.font = `900 260px ${FONT_STACK}`;
  ctx.fillText(String(data.score), SHARE_WIDTH / 2, 700);

  paintFaceIcon(ctx, SHARE_WIDTH / 2, 1020);

  ctx.fillStyle = FG;
  ctx.font = `bold 60px ${FONT_STACK}`;
  ctx.fillText('我不用手也能玩', SHARE_WIDTH / 2, 1250);

  ctx.fillStyle = DIM;
  ctx.font = `38px ${FONT_STACK}`;
  ctx.fillText(localDateLabel(data.date), SHARE_WIDTH / 2, 1350);

  ctx.restore();
}

/** 脸部线条图标：圆头 + 两点眼睛 + 微笑弧线，纯路径。 */
function paintFaceIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, 130, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = FG;
  for (const dx of [-48, 48]) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy - 30, 13, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = FG;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(cx, cy + 28, 62, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
}

/**
 * 生成并交付 PNG：navigator.canShare({files}) 时优先系统分享面板，
 * 否则直接下载 zero-touch-score-YYYYMMDD.png。失败（或用户取消分享）返回 false。
 */
export async function downloadShareCard(data: ShareCardData): Promise<boolean> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SHARE_WIDTH;
    canvas.height = SHARE_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    drawShareCard(ctx, data);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return false;

    const file = new File([blob], shareCardFileName(data.date), { type: 'image/png' });
    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
      share?: (data?: ShareData) => Promise<void>;
    };
    if (typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
      await nav.share?.({ files: [file], title: '零触控游乐场' });
      return true;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
