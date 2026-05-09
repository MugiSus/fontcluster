const CLUSTER_TEXT_COLORS = [
  'text-blue-500',
  'text-red-500',
  'text-yellow-500',
  'text-green-500',
  'text-purple-500',
  'text-orange-500',
  'text-teal-500',
  'text-indigo-500',
  'text-cyan-500',
  'text-fuchsia-500',
];

const CLUSTER_BG_COLORS = [
  'bg-blue-500',
  'bg-red-500',
  'bg-yellow-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-teal-500',
  'bg-indigo-500',
  'bg-cyan-500',
  'bg-fuchsia-500',
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
