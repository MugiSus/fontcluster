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
  /** Leaf index of this node's representative font; `-1` when unknown. */
  rep: number;
  /** Cluster with the most members in this subtree (`-1` when nothing is
   *  clustered) and that member count. Every final cluster is a contiguous
   *  subtree, so the two children of a merge hold disjoint cluster sets and
   *  the parent's majority is just the larger of the children's. */
  dominantK: number;
  dominantCount: number;
}

/** One merge node of the radial tree, drawn as a data dot. */
export interface DendrogramNodeDot {
  /** Dendrogram node index of the merge (leaf count + merge rank). */
  nodeIndex: number;
  /** Graph-space (y-down) merge point. */
  x: number;
  y: number;
  /** Cluster id shared by every visible point under the node, or `-1` when it
   *  spans clusters — the same encoding the node's edges use. */
  k: number;
  /** Zero-based rank of the node's merge, for the depth fade. */
  mergeIndex: number;
}

/** A merge node that carries its representative's sample image. */
export interface DendrogramImageAnchor {
  /** Dendrogram node index of the merge (leaf count + merge rank). */
  nodeIndex: number;
  /** Sample folder name of the representative leaf's font. */
  safeName: string;
  /** Graph-space (y-down) merge point the image centers on. */
  x: number;
  y: number;
  /** Cluster to tint the image with: the one with the most members in the
   *  merged subtree, or `-1` when nothing under it is clustered. */
  k: number;
  /** Radial gap to the absorbing parent, in graph units; `Infinity` at the
   *  root. The renderer only shows anchors whose gap fits the image box, so
   *  zooming in reveals more of them. */
  span: number;
}

interface DendrogramTree {
  edges: DendrogramEdge[];
  nodes: ClusterNode[];
  leafIndexByKey: Map<string, number>;
  /** Anchors at every representative's reign end: the innermost merge still
   *  represented by that font (its rep loses at the parent, or the root). */
  imageAnchors: DendrogramImageAnchor[];
  /** One dot per visible merge node, in merge order. */
  dots: DendrogramNodeDot[];
  /** Leaf order of the dendrogram (`ids[rep]` is a rep's safe name). */
  ids: string[];
}

const NO_ANCESTRY: GraphCoordinate[] = [];
const NO_EDGES: DendrogramEdge[] = [];
const NO_ANCHORS: DendrogramImageAnchor[] = [];
const NO_DOTS: DendrogramNodeDot[] = [];

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

/** Representative of a merge whose dendrogram predates the baked
 *  `representative` field: the larger child's representative carries over
 *  (ties keep the left) — the usual dendrogram labelling heuristic. */
function fallbackRepresentative(
  left: ClusterNode,
  right: ClusterNode,
  leftSize: number,
  rightSize: number,
): number {
  if (left.rep < 0) return right.rep;
  if (right.rep < 0) return left.rep;
  return leftSize >= rightSize ? left.rep : right.rep;
}

const dendrogramTree = createRoot(() => {
  const memo = createMemo<DendrogramTree | null>(() => {
    const radial = radialDendrogramLayout();
    const dendrogram = appState.dendrogram;
    if (!radial || !dendrogram) return null;

    const leafCount = dendrogram.ids.length;
    // Nodes are indexed like the merges: leaves first, then one node per merge.
    const nodes: ClusterNode[] = dendrogram.ids.map((id, index) => {
      const k = getGraphPointByKey(id)?.item.computed?.clustering?.k ?? -1;
      return {
        center: radial.nodeCenters[index] ?? null,
        angle: radial.nodeAngles[index] ?? Number.NaN,
        radius: radial.nodeRadii[index] ?? 0,
        k,
        parent: -1,
        rep: index,
        dominantK: k,
        dominantCount: k >= 0 ? 1 : 0,
      };
    });
    // Total (not just visible) leaves per node, for the fallback rep rule.
    const subtreeSizes: number[] = dendrogram.ids.map(() => 1);

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
          rep: -1,
          dominantK: -1,
          dominantCount: 0,
        });
        subtreeSizes.push(0);
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

      // The merged cluster's representative: the baked (centroid-nearest)
      // leaf when the session recorded one, else the larger-child heuristic.
      const baked = merge.representative;
      const rep =
        baked != null && baked >= 0 && baked < leafCount
          ? baked
          : fallbackRepresentative(
              left,
              right,
              subtreeSizes[merge.left] ?? 0,
              subtreeSizes[merge.right] ?? 0,
            );

      // Ties keep the left child for determinism, like the linkage order.
      const dominant = left.dominantCount >= right.dominantCount ? left : right;

      left.parent = nodeIndex;
      right.parent = nodeIndex;
      nodes.push({
        center,
        angle,
        radius,
        k,
        parent: -1,
        rep,
        dominantK: dominant.dominantK,
        dominantCount: dominant.dominantCount,
      });
      subtreeSizes.push(
        (subtreeSizes[merge.left] ?? 0) + (subtreeSizes[merge.right] ?? 0),
      );
    }

    // One anchor per representative, at its reign end: the innermost merge it
    // still represents (its rep is not the parent's, or the node is a root).
    // And one dot per visible merge node, sample or not, so every branch
    // point reads as an actual point.
    const imageAnchors: DendrogramImageAnchor[] = [];
    const dots: DendrogramNodeDot[] = [];
    for (const [nodeIndex, node] of nodes.entries()) {
      if (nodeIndex < leafCount || !node.center) continue;
      dots.push({
        nodeIndex,
        x: node.center.x,
        y: node.center.y,
        k: node.k,
        mergeIndex: nodeIndex - leafCount,
      });
      if (node.rep < 0) continue;
      const parent = node.parent === -1 ? null : nodes[node.parent];
      if (parent && parent.rep === node.rep) continue;
      const safeName = dendrogram.ids[node.rep];
      if (!safeName) continue;
      imageAnchors.push({
        nodeIndex,
        safeName,
        x: node.center.x,
        y: node.center.y,
        k: node.dominantK,
        span: parent ? node.radius - parent.radius : Number.POSITIVE_INFINITY,
      });
    }

    const leafIndexByKey = new Map(
      dendrogram.ids.map((id, index) => [id, index]),
    );

    return {
      edges,
      nodes,
      leafIndexByKey,
      imageAnchors,
      dots,
      ids: dendrogram.ids,
    };
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
 * One image anchor per representative's reign end (see
 * {@link DendrogramImageAnchor}), in node order. Empty when the dendrogram
 * mode is inactive or the session has no recorded dendrogram.
 */
export const dendrogramImageAnchors = (): DendrogramImageAnchor[] =>
  dendrogramTree()?.imageAnchors ?? NO_ANCHORS;

/**
 * One dot per visible merge node (see {@link DendrogramNodeDot}), in merge
 * order. Empty when the dendrogram mode is inactive or the session has no
 * recorded dendrogram.
 */
export const dendrogramNodeDots = (): DendrogramNodeDot[] =>
  dendrogramTree()?.dots ?? NO_DOTS;

/**
 * The representative handovers along a font's merge ancestry: an anchor at
 * every ancestor merge whose representative differs from the previous one on
 * the path — the "intermediate stages" a selected font passes through. Spans
 * are `Infinity` so these always survive the renderer's persistence filter.
 */
export function getDendrogramAncestryImageAnchors(
  key: string | null,
): DendrogramImageAnchor[] {
  const tree = dendrogramTree();
  if (!tree || !key) return NO_ANCHORS;
  const leafIndex = tree.leafIndexByKey.get(key);
  const leaf = leafIndex === undefined ? undefined : tree.nodes[leafIndex];
  if (!leaf?.center) return NO_ANCHORS;

  const anchors: DendrogramImageAnchor[] = [];
  let lastRep = leaf.rep;
  let node = leaf;
  while (node.parent !== -1) {
    const nodeIndex = node.parent;
    const parent = tree.nodes[nodeIndex];
    if (!parent?.center) break;
    if (parent.rep >= 0 && parent.rep !== lastRep) {
      const safeName = tree.ids[parent.rep];
      if (safeName) {
        anchors.push({
          nodeIndex,
          safeName,
          x: parent.center.x,
          y: parent.center.y,
          k: parent.dominantK,
          span: Number.POSITIVE_INFINITY,
        });
      }
      lastRep = parent.rep;
    }
    node = parent;
  }
  return anchors;
}

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
