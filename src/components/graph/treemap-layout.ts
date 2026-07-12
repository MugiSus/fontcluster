import {
  hierarchy,
  treemap,
  treemapBinary,
  type HierarchyRectangularNode,
} from 'd3-hierarchy';
import { type Accessor, createMemo, createRoot } from 'solid-js';
import { appState } from '@/store';
import { GRAPH_SIZE } from './constants';
import { type GraphCoordinate } from './types';

export interface TreemapLeafCell {
  key: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  colorIndex: number | undefined;
}

export interface TreemapBoundary {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mergeIndex: number;
  colorIndex: number | undefined;
}

/** Rectangle of one maximal final-cluster subtree. */
export interface TreemapClusterRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  colorIndex: number;
}

export interface TreemapLayout {
  positionByKey: Map<string, GraphCoordinate>;
  leafCells: TreemapLeafCell[];
  boundaries: TreemapBoundary[];
  clusterRects: TreemapClusterRect[];
}

interface TreemapNodeDatum {
  key: string | null;
  mergeIndex: number | null;
  clusterId: number | undefined;
  colorIndex: number | undefined;
  children?: TreemapNodeDatum[];
}

type TreemapRectNode = HierarchyRectangularNode<TreemapNodeDatum> & {
  children?: TreemapRectNode[];
};

interface TreemapLayoutState extends TreemapLayout {
  root: TreemapRectNode;
}

/**
 * Equal-leaf-weight rectangular projection of the persisted clustering tree.
 * The dendrogram remains the source of tree topology, while `displayData`
 * determines which leaves currently exist. No hierarchy sort is applied: the
 * backend's left/right merge order is preserved all the way to the cells.
 */
const treemapLayoutState = createRoot(() => {
  const memo = createMemo<TreemapLayoutState | null>(() => {
    if (appState.ui.graphMode !== 'treemap') return null;

    const dendrogram = appState.dendrogram;
    if (!dendrogram) return null;

    const { ids, merges } = dendrogram;
    const nodeCount = ids.length + merges.length;
    const hasParent = new Array<boolean>(nodeCount).fill(false);
    const nodes: (TreemapNodeDatum | null)[] = ids.map((key) => {
      const item = appState.fonts.displayData[key];
      return item
        ? {
            key,
            mergeIndex: null,
            clusterId: item.computed?.clustering?.k,
            colorIndex: item.computed?.clustering?.color_index,
          }
        : null;
    });

    // Linkage indices are topological, so every merge can be assembled in one
    // bottom-up pass. A missing side becomes a unary branch; it receives the
    // parent's rectangle but does not invent a visible split.
    for (const [mergeIndex, merge] of merges.entries()) {
      if (merge.left >= 0 && merge.left < nodeCount) {
        hasParent[merge.left] = true;
      }
      if (merge.right >= 0 && merge.right < nodeCount) {
        hasParent[merge.right] = true;
      }

      const left = nodes[merge.left] ?? null;
      const right = nodes[merge.right] ?? null;
      const children = [left, right].filter(
        (child): child is TreemapNodeDatum => child !== null,
      );

      if (children.length === 0) {
        nodes.push(null);
        continue;
      }

      const clusterId = children[0]!.clusterId;
      const isSameCluster = children.every(
        (child) => clusterId !== undefined && child.clusterId === clusterId,
      );
      nodes.push({
        key: null,
        mergeIndex,
        clusterId: isSameCluster ? clusterId : undefined,
        colorIndex: isSameCluster ? children[0]!.colorIndex : undefined,
        children,
      });
    }

    // A complete linkage has one root. The synthetic root also gives forests
    // a deterministic common rectangle without turning its partitions into
    // clustering boundaries.
    const roots = nodes.filter(
      (node, nodeIndex): node is TreemapNodeDatum =>
        node !== null && !hasParent[nodeIndex],
    );
    if (roots.length === 0) return null;

    const root = treemap<TreemapNodeDatum>()
      .tile(treemapBinary)
      .size([GRAPH_SIZE, GRAPH_SIZE])(
      hierarchy<TreemapNodeDatum>(
        {
          key: null,
          mergeIndex: null,
          clusterId: undefined,
          colorIndex: undefined,
          children: roots,
        },
        (node) => node.children,
      ).sum((node) => (node.key === null ? 0 : 1)),
    ) as TreemapRectNode;

    const positionByKey = new Map<string, GraphCoordinate>();
    const leafCells: TreemapLeafCell[] = [];
    for (const leaf of root.leaves() as TreemapRectNode[]) {
      if (leaf.data.key === null) continue;
      positionByKey.set(leaf.data.key, {
        x: (leaf.x0 + leaf.x1) / 2,
        y: (leaf.y0 + leaf.y1) / 2,
      });
      leafCells.push({
        key: leaf.data.key,
        x0: leaf.x0,
        y0: leaf.y0,
        x1: leaf.x1,
        y1: leaf.y1,
        colorIndex: leaf.data.colorIndex,
      });
    }

    const boundaries: TreemapBoundary[] = [];
    const clusterRects: TreemapClusterRect[] = [];
    root.eachBefore((node) => {
      const rectangularNode = node as TreemapRectNode;
      if (
        rectangularNode.data.clusterId !== undefined &&
        rectangularNode.data.colorIndex !== undefined &&
        rectangularNode.parent?.data.clusterId !==
          rectangularNode.data.clusterId
      ) {
        clusterRects.push({
          x0: rectangularNode.x0,
          y0: rectangularNode.y0,
          x1: rectangularNode.x1,
          y1: rectangularNode.y1,
          colorIndex: rectangularNode.data.colorIndex,
        });
      }

      const children = rectangularNode.children;
      if (rectangularNode.data.mergeIndex === null || children?.length !== 2) {
        return;
      }

      const [first, second] = children;
      if (first!.x1 === second!.x0 || second!.x1 === first!.x0) {
        boundaries.push({
          x1: first!.x1 === second!.x0 ? first!.x1 : second!.x1,
          y1: Math.max(first!.y0, second!.y0),
          x2: first!.x1 === second!.x0 ? first!.x1 : second!.x1,
          y2: Math.min(first!.y1, second!.y1),
          mergeIndex: rectangularNode.data.mergeIndex,
          colorIndex: rectangularNode.data.colorIndex,
        });
      } else {
        boundaries.push({
          x1: Math.max(first!.x0, second!.x0),
          y1: first!.y1 === second!.y0 ? first!.y1 : second!.y1,
          x2: Math.min(first!.x1, second!.x1),
          y2: first!.y1 === second!.y0 ? first!.y1 : second!.y1,
          mergeIndex: rectangularNode.data.mergeIndex,
          colorIndex: rectangularNode.data.colorIndex,
        });
      }
    });

    return { positionByKey, leafCells, boundaries, clusterRects, root };
  });
  return memo;
});

export const treemapLayout: Accessor<TreemapLayout | null> = treemapLayoutState;

/** Returns the leaf cell containing a graph-space point, if any. */
export function findTreemapLeafKey(x: number, y: number): string | null {
  let node: TreemapRectNode | undefined = treemapLayoutState()?.root;

  while (node) {
    if (node.data.key !== null) return node.data.key;

    const children = node.children;
    if (!children) return null;

    let containingChild: TreemapRectNode | undefined;
    for (const child of children) {
      if (x >= child.x0 && x <= child.x1 && y >= child.y0 && y <= child.y1) {
        containingChild = child;
        break;
      }
    }
    node = containingChild;
  }

  return null;
}
