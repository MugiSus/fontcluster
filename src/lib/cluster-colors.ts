import { toGamut, type Oklch, type P3, type Rgb } from 'culori';
import { type ClusteringData } from '@/types/font';

const CLUSTER_LIGHTNESS = 0.7193;
const CLUSTER_CHROMA = 0.157;
const UNCLUSTERED_CSS = 'rgb(113 113 122)';
const mapToSrgb = toGamut('rgb', 'oklch');
const mapToDisplayP3 = toGamut('p3', 'oklch');

export type RgbColorSpace = 'srgb' | 'display-p3';

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

/** Encoded RGB channels gamut-mapped to the selected output color space. */
export function getClusterRgb(
  angle: number,
  colorSpace: RgbColorSpace,
): Rgb | P3 {
  return colorSpace === 'display-p3'
    ? mapToDisplayP3(oklch(angle))
    : mapToSrgb(oklch(angle));
}
