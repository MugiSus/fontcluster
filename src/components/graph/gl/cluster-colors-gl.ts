// Resolves cluster colors as raw sRGB float triplets for the WebGL point cloud.
// This mirrors getClusterTextColor() in lib/cluster-colors but returns numeric
// RGB (read from the same `--cluster-*` CSS variables) so it stays in sync with
// the theme and the SVG rendering. It is a pure read of derived presentation
// data and owns no application state.

const CLUSTER_VAR_COUNT = 8;
// Tailwind `text-zinc-500`, used for unclustered / cluster id -1.
const UNCLUSTERED_HEX = '#71717a';

export type RgbTriplet = [number, number, number];

export interface ClusterColorPalette {
  cluster: RgbTriplet[];
  unclustered: RgbTriplet;
}

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

function readCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

export function readClusterColorPalette(): ClusterColorPalette {
  const cluster: RgbTriplet[] = [];
  for (let index = 1; index <= CLUSTER_VAR_COUNT; index += 1) {
    cluster.push(hexToRgb(readCssVar(`--cluster-${index}`, '#ffffff')));
  }
  return { cluster, unclustered: hexToRgb(UNCLUSTERED_HEX) };
}

export function colorForCluster(
  palette: ClusterColorPalette,
  clusterId: number | undefined,
): RgbTriplet {
  if (clusterId === undefined || clusterId === -1) return palette.unclustered;
  return palette.cluster[clusterId % palette.cluster.length]!;
}

function hslToRgb(h: number, s: number, l: number): RgbTriplet {
  if (s === 0) return [l, l, l];
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = h / 360;
  return [
    hue2rgb(p, q, hue + 1 / 3),
    hue2rgb(p, q, hue),
    hue2rgb(p, q, hue - 1 / 3),
  ];
}

export interface BackgroundInfo {
  rgb: RgbTriplet;
  isLight: boolean;
}

// Reads the theme's `--background` (an HSL triple like "240 13% 7%") so the
// renderer can match the panel background and pick a light/dark render mode.
export function readBackgroundColor(): BackgroundInfo {
  const raw = readCssVar('--background', '0 0% 100%');
  const parts = raw.split(/\s+/).filter(Boolean);
  const h = Number.parseFloat(parts[0] ?? '0') || 0;
  const s = (Number.parseFloat(parts[1] ?? '0') || 0) / 100;
  const l = (Number.parseFloat(parts[2] ?? '100') || 100) / 100;
  return { rgb: hslToRgb(h, s, l), isLight: l > 0.5 };
}
