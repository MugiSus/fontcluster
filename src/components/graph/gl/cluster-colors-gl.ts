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
