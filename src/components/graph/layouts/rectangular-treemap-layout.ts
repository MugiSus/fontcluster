import {
  hierarchy,
  treemap,
  treemapBinary,
  type HierarchyRectangularNode,
} from 'd3-hierarchy';
import {
  type DendrogramHierarchyDatum,
  type DendrogramTopology,
} from '@/components/graph/dendrogram-topology';
import { type GraphCoordinate } from '@/components/graph/types';
import { type GraphLayoutBase } from './types';

const RECTANGULAR_TREEMAP_WIDTH = 1500;
const RECTANGULAR_TREEMAP_HEIGHT = 900;

export interface RectangularTreemapLeafCell {
  readonly key: string;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly colorIndex: number | undefined;
}

export interface RectangularTreemapBoundary {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly mergeIndex: number;
  readonly colorIndex: number | undefined;
}

export interface RectangularTreemapClusterRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly colorIndex: number;
}

export interface RectangularTreemapLayout
  extends GraphLayoutBase<'rectangular-treemap'> {
  readonly leafCells: readonly RectangularTreemapLeafCell[];
  readonly boundaries: readonly RectangularTreemapBoundary[];
  readonly clusterRects: readonly RectangularTreemapClusterRect[];
}

type RectangularNode = HierarchyRectangularNode<DendrogramHierarchyDatum> & {
  children?: RectangularNode[];
};

/** Equal-leaf-weight rectangular projection of the shared linkage topology. */
export function createRectangularTreemapLayout(
  topology: DendrogramTopology,
): RectangularTreemapLayout {
  const root = treemap<DendrogramHierarchyDatum>()
    .tile(treemapBinary)
    .size([RECTANGULAR_TREEMAP_WIDTH, RECTANGULAR_TREEMAP_HEIGHT])(
    hierarchy(topology.rootData, (datum) => datum.children).sum((datum) =>
      datum.nodeIndex >= 0 && topology.nodes[datum.nodeIndex]?.key ? 1 : 0,
    ),
  ) as RectangularNode;

  const positionByKey = new Map<string, GraphCoordinate>();
  const leafCells: RectangularTreemapLeafCell[] = [];
  for (const leaf of root.leaves() as RectangularNode[]) {
    const node = topology.nodes[leaf.data.nodeIndex];
    if (!node?.key) continue;
    positionByKey.set(node.key, {
      x: (leaf.x0 + leaf.x1) / 2,
      y: (leaf.y0 + leaf.y1) / 2,
    });
    leafCells.push({
      key: node.key,
      x0: leaf.x0,
      y0: leaf.y0,
      x1: leaf.x1,
      y1: leaf.y1,
      colorIndex: node.colorIndex,
    });
  }

  const boundaries: RectangularTreemapBoundary[] = [];
  const clusterRects: RectangularTreemapClusterRect[] = [];
  root.eachBefore((hierarchyNode) => {
    const rectangularNode = hierarchyNode as RectangularNode;
    const node = topology.nodes[rectangularNode.data.nodeIndex];
    const parentNode = rectangularNode.parent
      ? topology.nodes[rectangularNode.parent.data.nodeIndex]
      : null;
    if (
      node?.clusterId !== undefined &&
      node.colorIndex !== undefined &&
      parentNode?.clusterId !== node.clusterId
    ) {
      clusterRects.push({
        x0: rectangularNode.x0,
        y0: rectangularNode.y0,
        x1: rectangularNode.x1,
        y1: rectangularNode.y1,
        colorIndex: node.colorIndex,
      });
    }

    const children = rectangularNode.children;
    if (!node || node.mergeIndex === null || children?.length !== 2) return;
    const [first, second] = children;
    if (first!.x1 === second!.x0 || second!.x1 === first!.x0) {
      boundaries.push({
        x1: first!.x1 === second!.x0 ? first!.x1 : second!.x1,
        y1: Math.max(first!.y0, second!.y0),
        x2: first!.x1 === second!.x0 ? first!.x1 : second!.x1,
        y2: Math.min(first!.y1, second!.y1),
        mergeIndex: node.mergeIndex,
        colorIndex: node.colorIndex,
      });
    } else {
      boundaries.push({
        x1: Math.max(first!.x0, second!.x0),
        y1: first!.y1 === second!.y0 ? first!.y1 : second!.y1,
        x2: Math.min(first!.x1, second!.x1),
        y2: first!.y1 === second!.y0 ? first!.y1 : second!.y1,
        mergeIndex: node.mergeIndex,
        colorIndex: node.colorIndex,
      });
    }
  });

  return {
    mode: 'rectangular-treemap',
    width: RECTANGULAR_TREEMAP_WIDTH,
    height: RECTANGULAR_TREEMAP_HEIGHT,
    positionByKey,
    leafCells,
    boundaries,
    clusterRects,
    findLeafKeyAt: (x, y) => {
      if (x < root.x0 || x > root.x1 || y < root.y0 || y > root.y1) {
        return null;
      }
      let node: RectangularNode | undefined = root;
      while (node) {
        const topologyNode = topology.nodes[node.data.nodeIndex];
        if (topologyNode?.key) return topologyNode.key;
        node = node.children?.find(
          (child) =>
            x >= child.x0 && x <= child.x1 && y >= child.y0 && y <= child.y1,
        );
      }
      return null;
    },
  };
}
