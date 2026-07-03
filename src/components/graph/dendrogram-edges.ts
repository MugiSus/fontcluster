import { createMemo, createRoot } from 'solid-js';
import { appState } from '@/store';
import { getGraphPointByKey } from './font-point-index';
import { type GraphCoordinate } from './types';

/**
 * Derives the line segments of the dendrogram mode from the session's full
 * merge tree (`appState.dendrogram`) and the current graph layout
 * (`font-point-index`).
 *
 * Every merge of the dendrogram becomes one segment connecting a
 * representative point of each merged cluster, so the n-1 segments form a
 * spanning tree over the actual font points. A cluster's representative is
 * maintained incrementally: when two clusters merge, the merged cluster keeps
 * whichever child representative lies closer to the merged cluster's 2-D
 * centroid, so representatives drift toward each cluster's visual centre
 * without materialising member lists.
 *
 * Leaves missing from the layout (not analysed, or hidden by a lasso result)
 * have no representative; merges touching such a cluster contribute no segment
 * and pass the surviving representative through.
 */

/** One dendrogram edge: a segment between two font points, in graph space. */
export interface DendrogramEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Running state of one dendrogram node during the merge replay. */
interface ClusterNode {
  representative: GraphCoordinate | null;
  sumX: number;
  sumY: number;
  count: number;
}

function distanceSquared(a: GraphCoordinate, x: number, y: number): number {
  const dx = a.x - x;
  const dy = a.y - y;
  return dx * dx + dy * dy;
}

/**
 * One edge per drawable dendrogram merge, in graph space (y-down). Empty when
 * the session has no recorded dendrogram.
 */
export const dendrogramEdges = createRoot(() => {
  const memo = createMemo<DendrogramEdge[]>(() => {
    const dendrogram = appState.dendrogram;
    if (!dendrogram) return [];

    // Nodes are indexed like the merges: leaves first, then one node per merge.
    const nodes: ClusterNode[] = dendrogram.ids.map((id) => {
      const point = getGraphPointByKey(id);
      return point
        ? { representative: point, sumX: point.x, sumY: point.y, count: 1 }
        : { representative: null, sumX: 0, sumY: 0, count: 0 };
    });

    const edges: DendrogramEdge[] = [];
    for (const merge of dendrogram.merges) {
      const left = nodes[merge.left];
      const right = nodes[merge.right];
      if (!left || !right) {
        // Malformed indices; keep the node list aligned with the merge list.
        nodes.push({ representative: null, sumX: 0, sumY: 0, count: 0 });
        continue;
      }

      if (left.representative && right.representative) {
        edges.push({
          x1: left.representative.x,
          y1: left.representative.y,
          x2: right.representative.x,
          y2: right.representative.y,
        });
      }

      const sumX = left.sumX + right.sumX;
      const sumY = left.sumY + right.sumY;
      const count = left.count + right.count;
      let representative = left.representative ?? right.representative;
      if (left.representative && right.representative) {
        const centroidX = sumX / count;
        const centroidY = sumY / count;
        representative =
          distanceSquared(left.representative, centroidX, centroidY) <=
          distanceSquared(right.representative, centroidX, centroidY)
            ? left.representative
            : right.representative;
      }
      nodes.push({ representative, sumX, sumY, count });
    }

    return edges;
  });
  return memo;
});
