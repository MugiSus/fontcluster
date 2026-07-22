/**
 * Color helpers for the WebGL graph layer.
 *
 * Cluster colors are converted from the persisted dendrogram angle by the
 * shared color module. The returned 0xRRGGBB number feeds Three.js directly.
 */
import { getClusterHexColor } from '@/lib/cluster-colors';

/** Tailwind `text-zinc-500`, used for unclustered points (no cluster). */
const UNCLUSTERED = 0xa0a0a4;
// Hex equivalents of the `--background` HSL values in index.css.
const BACKGROUND_LIGHT = 0xffffff;
const BACKGROUND_DARK = 0x000000;

/** Returns the 0xRRGGBB color for a font's circular dendrogram angle. */
export function getClusterColor({
  angle,
}: {
  angle: number | undefined;
  isDark?: boolean;
}): number {
  return angle === undefined ? UNCLUSTERED : getClusterHexColor(angle);
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
