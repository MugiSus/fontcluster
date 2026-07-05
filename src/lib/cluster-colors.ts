import { type ClusterColoring } from '@/types/font';

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

const CLUSTER_BG_COLORS = [
  'bg-cluster-1',
  'bg-cluster-2',
  'bg-cluster-3',
  'bg-cluster-4',
  'bg-cluster-5',
  'bg-cluster-6',
  'bg-cluster-7',
  'bg-cluster-8',
];

const CLUSTER_CSS_COLORS = [
  'var(--cluster-1)',
  'var(--cluster-2)',
  'var(--cluster-3)',
  'var(--cluster-4)',
  'var(--cluster-5)',
  'var(--cluster-6)',
  'var(--cluster-7)',
  'var(--cluster-8)',
];

/** Palette slot of a clustering: its stamped color, falling back to the
 *  cluster id for data persisted before colors existed. */
function paletteSlot(clustering: ClusterColoring): number {
  return clustering.color ?? clustering.k;
}

export function getClusterTextColor(
  clustering: ClusterColoring | null | undefined,
): string {
  if (!clustering || clustering.k === -1) {
    return 'text-zinc-500';
  }

  return CLUSTER_TEXT_COLORS[
    paletteSlot(clustering) % CLUSTER_TEXT_COLORS.length
  ]!;
}

export function getClusterBackgroundColor(
  clustering: ClusterColoring | null | undefined,
): string {
  if (!clustering || clustering.k === -1) {
    return 'bg-zinc-500';
  }

  return CLUSTER_BG_COLORS[paletteSlot(clustering) % CLUSTER_BG_COLORS.length]!;
}

export function getClusterCssColor(
  clustering: ClusterColoring | null | undefined,
): string {
  if (!clustering || clustering.k === -1) {
    return 'rgb(113 113 122)';
  }

  return CLUSTER_CSS_COLORS[
    paletteSlot(clustering) % CLUSTER_CSS_COLORS.length
  ]!;
}
