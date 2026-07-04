import { createMemo, createRoot } from 'solid-js';
import { appState } from '@/store';
import {
  arcPoints,
  polarPoint,
  radialDendrogramLayout,
} from './dendrogram-layout';
import { getGraphPointByKey } from './font-point-index';
import { type GraphCoordinate } from './types';

/**
 * Derives the dendrogram-mode line segments from the session's full merge
 * tree (`appState.dendrogram`) and the radial layout (`dendrogram-layout`).
 *
 * Every merge draws as a bracket rather than a V: an arc at the merge's
 * radius spanning its children's angles, plus one radial spoke from each
 * child in to that arc — the classic circular-dendrogram elbow. Arcs are
 * tessellated into short chords for the GL line renderer.
 *
 * Leaves missing from the layout (not analysed, or hidden by a filter) simply
 * don't take part; a merge with a single visible child passes through as a
 * plain spoke.
 */

/** One drawn segment of the radial tree, in graph space (y-down). */
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
  angle: number;
  radius: number;
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

/** Two points closer than this (in graph units) count as coincident. */
const COINCIDENT_EPSILON = 1e-6;

function isCoincident(a: GraphCoordinate, b: GraphCoordinate): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < COINCIDENT_EPSILON;
}

/** Cluster id of a node whose children have ids `left`/`right`; mixing two
 *  different ids (or anything unclustered) yields `-1`. */
function combineClusterIds(left: ClusterNode, right: ClusterNode): number {
  if (!left.center) return right.k;
  if (!right.center) return left.k;
  return left.k === right.k ? left.k : -1;
}

const dendrogramTree = createRoot(() => {
  const memo = createMemo<DendrogramTree | null>(() => {
    const radial = radialDendrogramLayout();
    const dendrogram = appState.dendrogram;
    if (!radial || !dendrogram) return null;

    const leafCount = dendrogram.ids.length;
    // Nodes are indexed like the merges: leaves first, then one node per merge.
    const nodes: ClusterNode[] = dendrogram.ids.map((id, index) => ({
      center: radial.nodeCenters[index] ?? null,
      angle: radial.nodeAngles[index] ?? Number.NaN,
      radius: radial.nodeRadii[index] ?? 0,
      k: getGraphPointByKey(id)?.item.computed?.clustering?.k ?? -1,
      parent: -1,
    }));

    const edges: DendrogramEdge[] = [];
    const pushPolyline = (
      points: GraphCoordinate[],
      mergeIndex: number,
      k: number,
    ) => {
      for (const [index, point] of points.entries()) {
        if (index === 0) continue;
        const previous = points[index - 1]!;
        // Degenerate chords happen when a child already sits on the merge's
        // radius (equal heights); a zero-length fat line renders as a smear.
        if (isCoincident(previous, point)) continue;
        edges.push({
          x1: previous.x,
          y1: previous.y,
          x2: point.x,
          y2: point.y,
          mergeIndex,
          k,
        });
      }
    };

    for (const [mergeIndex, merge] of dendrogram.merges.entries()) {
      const nodeIndex = leafCount + mergeIndex;
      const left = nodes[merge.left];
      const right = nodes[merge.right];
      if (!left || !right) {
        // Malformed indices; keep the node list aligned with the merge list.
        nodes.push({
          center: null,
          angle: Number.NaN,
          radius: 0,
          k: -1,
          parent: -1,
        });
        continue;
      }

      const center = radial.nodeCenters[nodeIndex] ?? null;
      const angle = radial.nodeAngles[nodeIndex] ?? Number.NaN;
      const radius = radial.nodeRadii[nodeIndex] ?? 0;
      const k = combineClusterIds(left, right);

      if (left.center && right.center) {
        // The bracket: a spoke from each child in to the merge's radius, and
        // the arc between the two elbows.
        const leftElbow = polarPoint(left.angle, radius);
        pushPolyline([left.center, leftElbow], mergeIndex, k);
        pushPolyline(
          [right.center, polarPoint(right.angle, radius)],
          mergeIndex,
          k,
        );
        pushPolyline(
          [leftElbow, ...arcPoints(left.angle, right.angle, radius)],
          mergeIndex,
          k,
        );
      } else if (center) {
        // One side hidden: the merge passes through as a plain spoke.
        const child = left.center ? left : right;
        pushPolyline([child.center!, center], mergeIndex, k);
      }

      left.parent = nodeIndex;
      right.parent = nodeIndex;
      nodes.push({ center, angle, radius, k, parent: -1 });
    }

    const leafIndexByKey = new Map(
      dendrogram.ids.map((id, index) => [id, index]),
    );

    return { edges, nodes, leafIndexByKey };
  });
  return memo;
});

/**
 * One edge per drawable chord of the radial tree, in graph space (y-down),
 * ordered by merge rank. Empty when the dendrogram mode is inactive or the
 * session has no recorded dendrogram.
 */
export const dendrogramEdges = (): DendrogramEdge[] =>
  dendrogramTree()?.edges ?? NO_EDGES;

/**
 * The polyline of a font's merge ancestry, in graph space, following the same
 * brackets the tree draws: from the font's point radially in to each
 * absorbing merge's radius, then along that merge's arc to its angle, up to
 * the root at the centre. Empty when the font or the dendrogram is absent.
 */
export function getDendrogramAncestry(key: string | null): GraphCoordinate[] {
  const tree = dendrogramTree();
  if (!tree || !key) return NO_ANCESTRY;
  const leafIndex = tree.leafIndexByKey.get(key);
  const leaf = leafIndex === undefined ? undefined : tree.nodes[leafIndex];
  if (!leaf?.center) return NO_ANCESTRY;

  const points: GraphCoordinate[] = [leaf.center];
  // Coincident joints (a merge at the same radius or angle) would put
  // zero-length links into the fat-line strip; drop them as they appear.
  const pushPoint = (point: GraphCoordinate) => {
    const last = points[points.length - 1];
    if (last && isCoincident(last, point)) return;
    points.push(point);
  };

  let angle = leaf.angle;
  let node = leaf;
  while (node.parent !== -1) {
    const parent = tree.nodes[node.parent];
    if (!parent?.center) break;
    pushPoint(polarPoint(angle, parent.radius));
    for (const point of arcPoints(angle, parent.angle, parent.radius)) {
      pushPoint(point);
    }
    angle = parent.angle;
    node = parent;
  }
  return points;
}
