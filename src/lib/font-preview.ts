import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { RenderFontPreview } from '@/types/font';

/** Tauri/browser adapter: the backend owns rendering/cache; the browser decodes before reveal. */
export const renderFontPreview: RenderFontPreview = async (
  font,
  text,
  fontSize,
) => {
  const url = convertFileSrc(
    await invoke<string>('render_font_preview', {
      payload: { font, text, font_size: fontSize },
    }),
  );
  const image = new Image();
  image.src = url;
  await image.decode();
  return url;
};
