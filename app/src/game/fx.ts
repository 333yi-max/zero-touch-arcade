/** 飘分数字：会话层在事件发生时推入，画布层按 until 过滤绘制。 */
export interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  until: number;
}

/** 飘字：升起来、淡出去。lifeMs 是存活时长（与 until 的差值）。 */
export function paintFloatTexts(
  ctx: CanvasRenderingContext2D,
  texts: readonly FloatText[],
  now: number,
  lifeMs = 900,
  risePx = 46,
): void {
  for (const t of texts) {
    if (t.until <= now) continue;
    const k = (t.until - now) / lifeMs;
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 2);
    ctx.font = '900 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = t.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y - (1 - k) * risePx);
    ctx.restore();
  }
}
