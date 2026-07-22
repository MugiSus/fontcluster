import { formatHex, toGamut, type Oklch } from 'culori';

const CLUSTER_LIGHTNESS = 0.715;
const CLUSTER_CHROMA = 0.1603;
const UNCLUSTERED_CSS = 'rgb(113 113 122)';
const UNCLUSTERED_HEX = 0xa0a0a4;
const mapToSrgb = toGamut('rgb', 'oklch');
const CLUSTER_TEXT_COLORS = [
  'text-cluster-1',
  'text-cluster-2',
  'text-cluster-3',
  'text-cluster-4',
  'text-cluster-5',
  'text-cluster-6',
  'text-cluster-7',
  'text-cluster-8',
];

function oklch(angle: number): Oklch {
  return {
    mode: 'oklch',
    l: CLUSTER_LIGHTNESS,
    c: CLUSTER_CHROMA,
    h: (angle * 180) / Math.PI,
  };
}

/** Discrete cluster color retained for the cluster filter control. */
export function getClusterTextColor(colorIndex: number): string {
  return CLUSTER_TEXT_COLORS[colorIndex % CLUSTER_TEXT_COLORS.length]!;
}

/** CSS color for a font's backend-owned circular dendrogram angle. */
export function getClusterCssColor(angle: number | undefined): string {
  if (angle === undefined) return UNCLUSTERED_CSS;
  return `oklch(${CLUSTER_LIGHTNESS} ${CLUSTER_CHROMA} ${(angle * 180) / Math.PI})`;
}

/** sRGB integer for Three.js, gamut-mapped from the same OKLCH color. */
export function getClusterHexColor(angle: number | undefined): number {
  if (angle === undefined) return UNCLUSTERED_HEX;
  return Number.parseInt(formatHex(mapToSrgb(oklch(angle))).slice(1), 16);
}
