import { formatHex, toGamut, type Oklch } from 'culori';
import { type ClusteringData } from '@/types/font';

const CLUSTER_LIGHTNESS = 0.715;
const CLUSTER_CHROMA = 0.1603;
const UNCLUSTERED_CSS = 'rgb(113 113 122)';
const UNCLUSTERED_HEX = 0xa0a0a4;
const mapToSrgb = toGamut('rgb', 'oklch');

export function getClusterColorAngle(
  clustering: ClusteringData | null | undefined,
): number | undefined {
  return clustering
    ? clustering.cluster_angle +
        (clustering.leaf_angle - clustering.cluster_angle) * 0.1
    : undefined;
}

function oklch(angle: number): Oklch {
  return {
    mode: 'oklch',
    l: CLUSTER_LIGHTNESS,
    c: CLUSTER_CHROMA,
    h: (angle * 180) / Math.PI,
  };
}

/** CSS color for a font's backend-owned circular dendrogram angle. */
export function getClusterCssColor(angle: number | undefined): string {
  if (angle === undefined) return UNCLUSTERED_CSS;
  return `oklch(${CLUSTER_LIGHTNESS} ${CLUSTER_CHROMA} ${(angle * 180) / Math.PI})`;
}

export function getClusteringCssColor(
  clustering: ClusteringData | null | undefined,
): string {
  return getClusterCssColor(getClusterColorAngle(clustering));
}

/** sRGB integer for Three.js, gamut-mapped from the same OKLCH color. */
export function getClusterHexColor(angle: number | undefined): number {
  if (angle === undefined) return UNCLUSTERED_HEX;
  return Number.parseInt(formatHex(mapToSrgb(oklch(angle))).slice(1), 16);
}
