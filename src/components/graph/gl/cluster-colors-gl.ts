/**
 * Color helpers for the WebGL graph layer.
 *
 * Colors are 0xRRGGBB integers (mirroring index.css) — nothing is read from the
 * DOM or CSS. Callers pass `isDark` (from the color-mode hook) to choose the
 * theme. The returned number feeds three's `Color.set()` / `setClearColor()`
 * directly; only the point buffer splits it into r/g/b floats. Keep these in
 * sync with the `--cluster-*` / `--background` values in index.css.
 */

// Cluster colors for cluster ids 0..7 (indexed modulo length).
const CLUSTER_LIGHT = [
  0x1aba8c, 0xcbcb2e, 0xda532a, 0x465ae0, 0x985cd5, 0x85d11b, 0xe3941f,
  0x4bace8,
];
const CLUSTER_DARK = [
  0x16d59f, 0xf7f71c, 0xec663e, 0x5468f0, 0xa65fed, 0x8edb21, 0xd88810,
  0x3db2fa,
];

/** Tailwind `text-zinc-500`, used for unclustered points / cluster id -1. */
const UNCLUSTERED = 0x71717a;
// Hex equivalents of the `--background` HSL values in index.css.
const BACKGROUND_LIGHT = 0xfdfdfe;
const BACKGROUND_DARK = 0x0e0f13;
// Hex equivalents of the `--foreground` HSL values in index.css.
const FOREGROUND_LIGHT = 0x0f172a;
const FOREGROUND_DARK = 0xf4f4f5;

/** Returns the 0xRRGGBB color for a cluster id in the given theme. */
export function getClusterColor({
  k,
  isDark,
}: {
  k: number | undefined;
  isDark?: boolean;
}): number {
  if (k === undefined || k === -1) return UNCLUSTERED;
  const palette = isDark ? CLUSTER_DARK : CLUSTER_LIGHT;
  return palette[k % palette.length]!;
}

/** Returns the 0xRRGGBB clear color (matching `--background`) for the theme. */
export function getBackgroundColor({ isDark }: { isDark?: boolean }): number {
  return isDark ? BACKGROUND_DARK : BACKGROUND_LIGHT;
}

/** Returns the 0xRRGGBB foreground color (matching `text-foreground`). */
export function getForegroundColor({ isDark }: { isDark?: boolean }): number {
  return isDark ? FOREGROUND_DARK : FOREGROUND_LIGHT;
}
