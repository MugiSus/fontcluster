let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null =
  null;

export function measureText(text: string, fontSize: number) {
  if (typeof window === 'undefined') return { width: 0, height: 0 };

  ctx ??= (
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(0, 0)
      : document.createElement('canvas')
  ).getContext('2d');

  if (!ctx) return { width: 0, height: 0 };

  ctx.font = `${fontSize}px "Noto Sans", sans-serif`;
  const measure = ctx.measureText(text);

  return {
    width: measure.actualBoundingBoxLeft + measure.actualBoundingBoxRight,
    height: measure.actualBoundingBoxAscent + measure.actualBoundingBoxDescent,
  };
}
