const CLUSTER_COLORS = [
  0x3b82f6, 0xef4444, 0xeab308, 0x22c55e, 0xa855f7, 0xf97316, 0x14b8a6,
  0x6366f1, 0x06b6d4, 0xd946ef,
];

export function getClusterTintColor(clusterId: number | undefined): number {
  if (clusterId === undefined || clusterId === -1) {
    return 0xa1a1aa;
  }

  return CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length] ?? 0x3b82f6;
}
