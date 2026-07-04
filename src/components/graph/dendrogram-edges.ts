import { createMemo, createRoot } from 'solid-js';
import { appState } from '@/store';
import { radialDendrogramLayout } from './dendrogram-layout';
import { getGraphPointByKey } from './font-point-index';
import { type GraphCoordinate } from './types';

/**
 * Derives the dendrogram-mode geometry from the session's full merge tree
 * (`appState.dendrogram`) and the current graph layout (`font-point-index`).
 *
 * Every dendrogram node gets a 2-D centre — in the radial layout the position
 * `dendrogram-layout` computed for it, otherwise the centroid of its member
 * points (a leaf sits on its point) — and each merge contributes one segment
 * per child, from the child's centre to the merged node's centre. Fine merges
 * become short local links and coarse merges become trunks, so the hierarchy
 * reads as a tree instead of a hairball of point-to-point chords.
 *
 * Leaves missing from the layout (not analysed, or hidden by a lasso result)
 * simply don't contribute to centroids; a merge only draws its segments when
 * both children have visible members.
 */

/** One drawn segment of the centroid tree, in graph space (y-down). */
export interface DendrogramEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Zero-based rank of the merge this edge belongs to, in linkage order
   *  (ascending dissimilarity). Edges are emitted in this order. */
  mergeIndex: number;
  /** Final cluster id shared by every visible point under the merged node, or
   *  `-1` when the merge spans clusters (or contains unclustered points). */
  k: number;
}

/** Resolved state of one dendrogram node (leaves first, then one per merge). */
interface ClusterNode {
  center: GraphCoordinate | null;
  sumX: number;
  sumY: number;
  count: number;
  k: number;
  /** Node index of the merge that absorbed this node; `-1` for the root. */
  parent: number;
}

interface DendrogramTree {
  edges: DendrogramEdge[];
  nodes: ClusterNode[];
  leafIndexByKey: Map<string, number>;
}

const NO_ANCESTRY: GraphCoordinate[] = [];
const NO_EDGES: DendrogramEdge[] = [];

/** Cluster id of a node whose children have ids `left`/`right`; mixing two
 *  different ids (or anything unclustered) yields `-1`. */
function combineClusterIds(left: ClusterNode, right: ClusterNode): number {
  if (left.count === 0) return right.k;
  if (right.count === 0) return left.k;
  return left.k === right.k ? left.k : -1;
}

const dendrogramTree = createRoot(() => {
  const memo = createMemo<DendrogramTree | null>(() => {
    const dendrogram = appState.dendrogram;
    if (!dendrogram) return null;
    // In the radial layout, merge centres come from the layout instead of the
    // member centroid. Leaf positions need no override: the point index
    // already serves the ring positions there.
    const radial = radialDendrogramLayout();

    // Nodes are indexed like the merges: leaves first, then one node per merge.
    const nodes: ClusterNode[] = dendrogram.ids.map((id) => {
      const point = getGraphPointByKey(id);
      return point
        ? {
            center: point,
            sumX: point.x,
            sumY: point.y,
            count: 1,
            k: point.item.computed?.clustering?.k ?? -1,
            parent: -1,
          }
        : { center: null, sumX: 0, sumY: 0, count: 0, k: -1, parent: -1 };
    });

    const edges: DendrogramEdge[] = [];
    for (const [mergeIndex, merge] of dendrogram.merges.entries()) {
      const nodeIndex = nodes.length;
      const left = nodes[merge.left];
      const right = nodes[merge.right];
      if (!left || !right) {
        // Malformed indices; keep the node list aligned with the merge list.
        nodes.push({
          center: null,
          sumX: 0,
          sumY: 0,
          count: 0,
          k: -1,
          parent: -1,
        });
        continue;
      }

      const sumX = left.sumX + right.sumX;
      const sumY = left.sumY + right.sumY;
      const count = left.count + right.count;
      const k = combineClusterIds(left, right);
      const center: GraphCoordinate | null = radial
        ? (radial.nodeCenters[nodeIndex] ?? null)
        : count > 0
          ? { x: sumX / count, y: sumY / count }
          : null;

      if (left.center && right.center && center) {
        edges.push(
          {
            x1: left.center.x,
            y1: left.center.y,
            x2: center.x,
            y2: center.y,
            mergeIndex,
            k,
          },
          {
            x1: right.center.x,
            y1: right.center.y,
            x2: center.x,
            y2: center.y,
            mergeIndex,
            k,
          },
        );
      }

      left.parent = nodeIndex;
      right.parent = nodeIndex;
      nodes.push({ center, sumX, sumY, count, k, parent: -1 });
    }

    const leafIndexByKey = new Map(
      dendrogram.ids.map((id, index) => [id, index]),
    );

    return { edges, nodes, leafIndexByKey };
  });
  return memo;
});

/**
 * One edge per drawable child-to-parent link of the centroid tree, in graph
 * space (y-down), ordered by merge rank. Empty when the session has no
 * recorded dendrogram.
 */
export const dendrogramEdges = (): DendrogramEdge[] =>
  dendrogramTree()?.edges ?? NO_EDGES;

/**
 * The polyline of a font's merge ancestry, in graph space: its point followed
 * by the centre of every successive merge that absorbed it, up to the root.
 * Empty when the font or the dendrogram is absent.
 */
export function getDendrogramAncestry(key: string | null): GraphCoordinate[] {
  const tree = dendrogramTree();
  if (!tree || !key) return NO_ANCESTRY;
  const leafIndex = tree.leafIndexByKey.get(key);
  const leaf = leafIndex === undefined ? undefined : tree.nodes[leafIndex];
  if (!leaf?.center) return NO_ANCESTRY;

  const points: GraphCoordinate[] = [leaf.center];
  let node = leaf;
  while (node.parent !== -1) {
    const parent = tree.nodes[node.parent];
    if (!parent?.center) break;
    points.push(parent.center);
    node = parent;
  }
  return points;
}
