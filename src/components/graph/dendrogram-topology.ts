import { type FontItemRecord } from '@/types/font';
import { type DendrogramData } from '@/types/session';
import { getClusterColorAngle } from '@/lib/cluster-colors';

export interface DendrogramHierarchyDatum {
  readonly nodeIndex: number;
  readonly children?: readonly DendrogramHierarchyDatum[];
}

export interface DendrogramTopologyNode {
  readonly index: number;
  readonly key: string | null;
  readonly mergeIndex: number | null;
  readonly children: readonly number[];
  readonly parentIndex: number | null;
  readonly visibleLeafCount: number;
  readonly height: number;
  readonly representativeKey: string | null;
  readonly clusterId: number | undefined;
  readonly colorAngle: number | undefined;
}

export interface DendrogramTopology {
  readonly nodes: readonly (DendrogramTopologyNode | null)[];
  readonly roots: readonly number[];
  readonly visibleLeafIndexes: readonly number[];
  readonly representativeWinCountByLeafIndex: readonly number[];
  readonly leafIndexByKey: ReadonlyMap<string, number>;
  readonly rootData: DendrogramHierarchyDatum;
  readonly leafCount: number;
  readonly maxHeight: number;
}

/**
 * Builds the visible, coordinate-free topology shared by every hierarchy
 * layout. Linkage node indices and left/right order remain unchanged; leaves
 * missing from the active display payload are removed without mutating the
 * persisted dendrogram.
 */
export function createDendrogramTopology(
  dendrogram: DendrogramData,
  displayData: FontItemRecord,
): DendrogramTopology | null {
  const { ids, merges } = dendrogram;
  const leafCount = ids.length;
  const nodeCount = leafCount + merges.length;
  const representativeWinCountByLeafIndex = new Array<number>(leafCount).fill(
    0,
  );
  const parentIndexes = new Array<number | null>(nodeCount).fill(null);
  const nodes: (DendrogramTopologyNode | null)[] = ids.map((key, index) => {
    const clustering = displayData[key]?.computed?.clustering ?? undefined;
    return displayData[key]
      ? {
          index,
          key,
          mergeIndex: null,
          children: [],
          parentIndex: null,
          visibleLeafCount: 1,
          height: 0,
          representativeKey: key,
          clusterId: clustering?.k,
          colorAngle: getClusterColorAngle(
            clustering?.leaf_angle,
            clustering?.cluster_angle,
          ),
        }
      : null;
  });

  for (const [mergeIndex, merge] of merges.entries()) {
    const winCount = representativeWinCountByLeafIndex[merge.representative];
    if (winCount !== undefined) {
      representativeWinCountByLeafIndex[merge.representative] = winCount + 1;
    }
    const index = leafCount + mergeIndex;
    const childIndexes = [merge.left, merge.right].filter(
      (childIndex) => childIndex >= 0 && childIndex < index,
    );
    for (const childIndex of childIndexes) parentIndexes[childIndex] = index;

    const visibleChildren = childIndexes.filter(
      (childIndex) => nodes[childIndex] !== null,
    );
    if (visibleChildren.length === 0) {
      nodes.push(null);
      continue;
    }

    const firstChild = nodes[visibleChildren[0]!]!;
    const clusterId = firstChild.clusterId;
    const isSameCluster = visibleChildren.every(
      (childIndex) =>
        clusterId !== undefined && nodes[childIndex]!.clusterId === clusterId,
    );
    nodes.push({
      index,
      key: null,
      mergeIndex,
      children: visibleChildren,
      parentIndex: null,
      visibleLeafCount: visibleChildren.reduce(
        (count, childIndex) => count + nodes[childIndex]!.visibleLeafCount,
        0,
      ),
      height: merge.height,
      representativeKey: ids[merge.representative] ?? null,
      clusterId: isSameCluster ? clusterId : undefined,
      colorAngle: isSameCluster ? firstChild.colorAngle : undefined,
    });
  }

  const finalizedNodes = nodes.map((node, index) =>
    node ? { ...node, parentIndex: parentIndexes[index] ?? null } : null,
  );
  const roots = finalizedNodes.flatMap((node, index) =>
    node && node.parentIndex === null ? [index] : [],
  );
  if (roots.length === 0) return null;

  const hierarchyData = new Array<DendrogramHierarchyDatum | null>(
    nodeCount,
  ).fill(null);
  for (const [index, node] of finalizedNodes.entries()) {
    if (!node) continue;
    const children = node.children.flatMap((childIndex) => {
      const child = hierarchyData[childIndex];
      return child ? [child] : [];
    });
    hierarchyData[index] = {
      nodeIndex: index,
      ...(children.length > 0 ? { children } : {}),
    };
  }
  const rootData =
    roots.length === 1
      ? hierarchyData[roots[0]!]!
      : {
          nodeIndex: -1,
          children: roots.map((root) => hierarchyData[root]!),
        };

  return {
    nodes: finalizedNodes,
    roots,
    visibleLeafIndexes: finalizedNodes.flatMap((node, index) =>
      node?.key ? [index] : [],
    ),
    representativeWinCountByLeafIndex,
    leafIndexByKey: new Map(ids.map((id, index) => [id, index])),
    rootData,
    leafCount,
    maxHeight: finalizedNodes.reduce(
      (maximum, node) => Math.max(maximum, node?.height ?? 0),
      0,
    ),
  };
}
