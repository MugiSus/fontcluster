import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { RenderFontPreview } from '@/types/font';

/** Tauri/browser adapter: the backend owns rendering/cache; the browser decodes before reveal. */
export const renderFontPreview: RenderFontPreview = async (
  font,
  candidates,
  fontSize,
) => {
  const lines = await invoke<{ text: string; path: string }[]>(
    'render_font_preview',
    { payload: { font, candidates, font_size: fontSize } },
  );
  return Promise.all(
    lines.map(async ({ text, path }) => {
      const url = convertFileSrc(path);
      const image = new Image();
      image.src = url;
      await image.decode();
      return { text, url };
    }),
  );
};
