const CLUSTER_TEXT_COLORS = [
  'text-blue-400',
  'text-red-400',
  'text-yellow-400',
  'text-green-400',
  'text-purple-400',
  'text-orange-400',
  'text-teal-400',
  'text-indigo-400',
  'text-cyan-400',
  'text-fuchsia-400',
];

const CLUSTER_BG_COLORS = [
  'bg-blue-400',
  'bg-red-400',
  'bg-yellow-400',
  'bg-green-400',
  'bg-purple-400',
  'bg-orange-400',
  'bg-teal-400',
  'bg-indigo-400',
  'bg-cyan-400',
  'bg-fuchsia-400',
];

export function getClusterTextColor(clusterId: number): string {
  if (clusterId === -1) {
    return 'text-gray-400';
  }

  return (
    CLUSTER_TEXT_COLORS[clusterId % CLUSTER_TEXT_COLORS.length] ??
    'text-blue-500'
  );
}

export function getClusterBgColor(clusterId: number): string {
  if (clusterId === -1) {
    return 'bg-gray-400';
  }

  return (
    CLUSTER_BG_COLORS[clusterId % CLUSTER_BG_COLORS.length] ?? 'bg-blue-500'
  );
}
