/**
 * Color helpers for the WebGL graph layer.
 *
 * Cluster colors are read straight from the `--cluster-*` CSS variables (which
 * are authored as hex) and parsed with {@link hexToRgb}. The theme background
 * is HSL in CSS, so rather than parse HSL at runtime we keep the two background
 * colors as hex constants that mirror `index.css`.
 */

export type RgbTriplet = [number, number, number];

const CLUSTER_VAR_COUNT = 8;
/** Tailwind `text-zinc-500`, used for unclustered points / cluster id -1. */
const UNCLUSTERED_HEX = '#71717a';

// Hex equivalents of the `--background` HSL values in index.css. Update these
// alongside the theme: light `210 50% 99.4%`, dark `240 13% 7%`.
const LIGHT_BACKGROUND_HEX = '#fdfefe';
const DARK_BACKGROUND_HEX = '#0f0f14';

/** Parses `#rgb` / `#rrggbb` to a 0..1 RGB triple (white on bad input). */
function hexToRgb(hex: string): RgbTriplet {
  const value = hex.trim().replace(/^#/, '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;
  const int = Number.parseInt(full, 16);
  if (!Number.isFinite(int) || full.length !== 6) return [1, 1, 1];
  return [
    ((int >> 16) & 255) / 255,
    ((int >> 8) & 255) / 255,
    (int & 255) / 255,
  ];
}

/** Reads a CSS custom property off `:root`, with a fallback if it is empty. */
function readCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

export interface ClusterColorPalette {
  /** Colors for cluster ids 0..7 (indexed modulo length). */
  cluster: RgbTriplet[];
  /** Color for unclustered points (cluster id undefined or -1). */
  unclustered: RgbTriplet;
}

/** Reads the current theme's cluster palette from the `--cluster-*` variables. */
export function readClusterColorPalette(): ClusterColorPalette {
  const cluster: RgbTriplet[] = [];
  for (let index = 1; index <= CLUSTER_VAR_COUNT; index += 1) {
    cluster.push(hexToRgb(readCssVar(`--cluster-${index}`, '#ffffff')));
  }
  return { cluster, unclustered: hexToRgb(UNCLUSTERED_HEX) };
}

/** Picks the palette color for a cluster id (mirrors `getClusterTextColor`). */
export function colorForCluster(
  palette: ClusterColorPalette,
  clusterId: number | undefined,
): RgbTriplet {
  if (clusterId === undefined || clusterId === -1) return palette.unclustered;
  return palette.cluster[clusterId % palette.cluster.length]!;
}

export interface ThemeBackground {
  /** The background color, matching the panel's CSS `--background`. */
  rgb: RgbTriplet;
  /** True in light mode (drives the subtractive/additive render choice). */
  isLight: boolean;
}

/**
 * Reports the current theme background. Dark mode is read from the
 * `data-kb-theme` attribute Kobalte sets on `:root` — the same hook index.css
 * themes on — and the color comes from the hex constants above.
 */
export function readThemeBackground(): ThemeBackground {
  const isDark =
    document.documentElement.getAttribute('data-kb-theme') === 'dark';
  return {
    rgb: hexToRgb(isDark ? DARK_BACKGROUND_HEX : LIGHT_BACKGROUND_HEX),
    isLight: !isDark,
  };
}
