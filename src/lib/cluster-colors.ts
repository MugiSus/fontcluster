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

export function getClusterTextColor(clusterId: number | undefined): string {
  if (clusterId === undefined || clusterId === -1) {
    return 'text-zinc-500';
  }

  return CLUSTER_TEXT_COLORS[clusterId % CLUSTER_TEXT_COLORS.length]!;
}

export function getClusterBackgroundColor(
  clusterId: number | undefined,
): string {
  if (clusterId === undefined || clusterId === -1) {
    return 'bg-zinc-500';
  }

  return CLUSTER_BG_COLORS[clusterId % CLUSTER_BG_COLORS.length]!;
}
