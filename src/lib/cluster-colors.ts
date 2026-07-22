import { formatHex, toGamut, type Oklch } from 'culori';

const CLUSTER_LIGHTNESS = 0.715;
const CLUSTER_CHROMA = 0.1603;
const UNCLUSTERED_CSS = 'rgb(113 113 122)';
const UNCLUSTERED_HEX = 0xa0a0a4;
const mapToSrgb = toGamut('rgb', 'oklch');
const LEAF_ANGLE_MIX = 0.1;

export function getClusterColorAngle(
  leafAngle: number | undefined,
  clusterAngle: number | undefined,
): number | undefined {
  if (leafAngle === undefined || clusterAngle === undefined) return undefined;
  return clusterAngle + (leafAngle - clusterAngle) * LEAF_ANGLE_MIX;
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

/** sRGB integer for Three.js, gamut-mapped from the same OKLCH color. */
export function getClusterHexColor(angle: number | undefined): number {
  if (angle === undefined) return UNCLUSTERED_HEX;
  return Number.parseInt(formatHex(mapToSrgb(oklch(angle))).slice(1), 16);
}
