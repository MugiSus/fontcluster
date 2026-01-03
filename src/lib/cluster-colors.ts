const CLUSTER_TEXT_COLORS = [
  'text-blue-500 dark:text-blue-400',
  'text-red-500 dark:text-red-400',
  'text-yellow-500 dark:text-yellow-400',
  'text-green-500 dark:text-green-400',
  'text-purple-500 dark:text-purple-400',
  'text-orange-500 dark:text-orange-400',
  'text-teal-500 dark:text-teal-400',
  'text-indigo-500 dark:text-indigo-400',
  'text-cyan-500 dark:text-cyan-400',
  'text-fuchsia-500 dark:text-fuchsia-400',
];

const CLUSTER_BG_COLORS = [
  'bg-blue-500 dark:bg-blue-400',
  'bg-red-500 dark:bg-red-400',
  'bg-yellow-500 dark:bg-yellow-400',
  'bg-green-500 dark:bg-green-400',
  'bg-purple-500 dark:bg-purple-400',
  'bg-orange-500 dark:bg-orange-400',
  'bg-teal-500 dark:bg-teal-400',
  'bg-indigo-500 dark:bg-indigo-400',
  'bg-cyan-500 dark:bg-cyan-400',
  'bg-fuchsia-500 dark:bg-fuchsia-400',
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
    CLUSTER_BG_COLORS[clusterId % CLUSTER_BG_COLORS.length] ?? 'bg-blue-400'
  );
}
