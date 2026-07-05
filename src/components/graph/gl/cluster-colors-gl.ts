/**
 * Color helpers for the WebGL graph layer.
 *
 * Colors are 0xRRGGBB integers (mirroring index.css) — nothing is read from the
 * DOM or CSS. Callers pass `isDark` (from the color-mode hook) to choose the
 * theme. The returned number feeds three's `Color.set()` / `setClearColor()`
 * directly; only the point buffer splits it into r/g/b floats. Keep these in
 * sync with the `--cluster-*` / `--background` values in index.css.
 */

import { type ClusterColoring } from '@/types/font';

// Cluster palette, indexed by the clustering's palette slot (modulo length).
const CLUSTER_LIGHT = [
  0x1aba8c, 0xcbcb2e, 0xda532a, 0x465ae0, 0x985cd5, 0x85d11b, 0xe3941f,
  0x4bace8,
];
const CLUSTER_DARK = [
  0x16d59f, 0xf7f71c, 0xec663e, 0x6477f4, 0xa65fed, 0x8edb21, 0xd88810,
  0x3db2fa,
];

/** Tailwind `text-zinc-500`, used for unclustered points (no cluster). */
const UNCLUSTERED = 0x71717a;
// Hex equivalents of the `--background` HSL values in index.css.
const BACKGROUND_LIGHT = 0xfdfdfe;
const BACKGROUND_DARK = 0x0e0f13;

/** Returns the 0xRRGGBB color for a font's clustering in the given theme.
 *  The slot is the stamped `color`, falling back to `k` for data persisted
 *  before colors existed. */
export function getClusterColor({
  clustering,
  isDark,
}: {
  clustering: ClusterColoring | null | undefined;
  isDark?: boolean;
}): number {
  if (!clustering || clustering.k === -1) return UNCLUSTERED;
  const palette = isDark ? CLUSTER_DARK : CLUSTER_LIGHT;
  return palette[(clustering.color ?? clustering.k) % palette.length]!;
}

/** Returns the 0xRRGGBB clear color (matching `--background`) for the theme. */
export function getBackgroundColor({ isDark }: { isDark?: boolean }): number {
  return isDark ? BACKGROUND_DARK : BACKGROUND_LIGHT;
}
