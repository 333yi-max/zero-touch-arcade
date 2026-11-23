/** 确定性伪随机：同一索引永远同一值，尘埃不闪跳。 */
function fract(v: number): number {
  return v - Math.floor(v);
}

const DUST_COUNT = 44;

/** 画布背景层：网格 + 缓慢漂移的尘埃。reduced-motion 时传 now=0，尘埃静止。 */
export function paintBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  now: number,
): void {
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 64) {
    ctx.strokeStyle = x % 256 === 0 ? 'rgba(88,196,255,0.06)' : 'rgba(88,196,255,0.028)';
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 64) {
    ctx.strokeStyle = y % 256 === 0 ? 'rgba(88,196,255,0.06)' : 'rgba(88,196,255,0.028)';
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.stroke();
  }

  for (let i = 0; i < DUST_COUNT; i += 1) {
    const seed = fract(Math.sin(i * 127.1) * 43758.5453);
    const seed2 = fract(Math.sin(i * 311.7) * 24634.6345);
    const x = seed * width;
    const y = (seed2 * height + now * (0.006 + seed * 0.018)) % height;
    ctx.globalAlpha = 0.04 + seed * 0.1;
    ctx.fillStyle = '#96dcff';
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
}
