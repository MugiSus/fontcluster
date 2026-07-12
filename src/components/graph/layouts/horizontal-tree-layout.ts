import { cluster, hierarchy, type HierarchyPointNode } from 'd3-hierarchy';
import { GRAPH_SIZE } from '@/components/graph/constants';
import {
  type DendrogramHierarchyDatum,
  type DendrogramTopology,
} from '@/components/graph/dendrogram-topology';
import { type GraphCoordinate } from '@/components/graph/types';
import { type GraphLayoutBase } from './types';

export interface HorizontalTreeLayout
  extends GraphLayoutBase<'horizontal-tree'> {
  readonly topology: DendrogramTopology;
  readonly nodeCenters: readonly (GraphCoordinate | null)[];
}

/**
 * Left-to-right Cartesian dendrogram. D3 owns the OLO-preserving vertical leaf
 * distribution; recorded linkage height owns the horizontal distance scale.
 */
export function createHorizontalTreeLayout(
  topology: DendrogramTopology,
): HorizontalTreeLayout {
  const root = cluster<DendrogramHierarchyDatum>()
    .size([GRAPH_SIZE, GRAPH_SIZE])
    .separation(() => 1)(
    hierarchy(topology.rootData, (datum) => datum.children),
  ) as HierarchyPointNode<DendrogramHierarchyDatum>;
  const nodeCenters = new Array<GraphCoordinate | null>(
    topology.nodes.length,
  ).fill(null);

  root.eachBefore((hierarchyNode) => {
    const nodeIndex = hierarchyNode.data.nodeIndex;
    const node = topology.nodes[nodeIndex];
    if (!node) return;
    nodeCenters[nodeIndex] = {
      x:
        node.key !== null
          ? GRAPH_SIZE
          : topology.maxHeight > 0
            ? GRAPH_SIZE * (1 - node.height / topology.maxHeight)
            : 0,
      y: hierarchyNode.x,
    };
  });

  const positionByKey = new Map<string, GraphCoordinate>();
  for (const leafIndex of topology.visibleLeafIndexes) {
    const node = topology.nodes[leafIndex];
    const center = nodeCenters[leafIndex];
    if (node?.key && center) positionByKey.set(node.key, center);
  }

  return {
    mode: 'horizontal-tree',
    topology,
    positionByKey,
    nodeCenters,
  };
}
