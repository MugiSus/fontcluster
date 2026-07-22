/**
 * Color helpers for the WebGL graph layer.
 *
 * Culori gamut-maps the authored OKLCH color to the renderer's selected output
 * gamut. Three.js then converts those encoded source channels into the matching
 * linear working space for every managed shader.
 */
import { Color, SRGBColorSpace } from 'three';
import { DisplayP3ColorSpace } from 'three/addons/math/ColorSpaces.js';
import { getClusterRgb, type RgbColorSpace } from '@/lib/cluster-colors';

export type GraphOutputColorSpace = RgbColorSpace;

/** Tailwind `text-zinc-500`, used for unclustered points (no cluster). */
const UNCLUSTERED = 0xa0a0a4;
// Hex equivalents of the `--background` HSL values in index.css.
const BACKGROUND_LIGHT = 0xffffff;
const BACKGROUND_DARK = 0x000000;

/** Returns a new font color in Three.js's selected linear working space. */
export function getClusterColor({
  angle,
  colorSpace,
}: {
  angle: number | undefined;
  colorSpace: GraphOutputColorSpace;
}): Color {
  if (angle === undefined) return new Color(UNCLUSTERED);
  const color = getClusterRgb(angle, colorSpace);
  return new Color().setRGB(
    color.r,
    color.g,
    color.b,
    color.mode === 'p3' ? DisplayP3ColorSpace : SRGBColorSpace,
  );
}

/** Returns the 0xRRGGBB clear color (matching `--background`) for the theme. */
export function getBackgroundColor({ isDark }: { isDark?: boolean }): number {
  return isDark ? BACKGROUND_DARK : BACKGROUND_LIGHT;
}

// Scatter-grid hairline grays: the `--border` values in index.css as sRGB hex,
// so the σ=0 mean cross draws exactly border-border; minor lines lerp halfway
// towards the background in the grid layer (visually border-border/50).
const GRID_LIGHT = 0xd6dee9;
const GRID_DARK = 0x333338;

/** Returns the 0xRRGGBB scatter-grid line color for the theme. */
export function getScatterGridColor({ isDark }: { isDark?: boolean }): number {
  return isDark ? GRID_DARK : GRID_LIGHT;
}
