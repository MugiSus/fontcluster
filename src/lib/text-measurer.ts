import { createRoot } from 'solid-js';

export const measureText = createRoot(() => {
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(0, 0)
      : document.createElement('canvas');

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D context for text measurement');
  }

  return (text: string, fontSize: number) => {
    ctx.font = `${fontSize}px "Noto Sans", sans-serif`;
    const metrics = ctx.measureText(text);

    const ascent = metrics.actualBoundingBoxAscent;
    const descent = metrics.actualBoundingBoxDescent;
    const left = metrics.actualBoundingBoxLeft;
    const right = metrics.actualBoundingBoxRight;

    return {
      height: ascent + descent,
      width: left + right,
    };
  };
});
