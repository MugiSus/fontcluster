import { createMemo, createRoot } from 'solid-js';
import { appState } from '@/store';
import { type ClusterColoring } from '@/types/font';
import {
  arcPoints,
  polarPoint,
  radialDendrogramLayout,
} from './dendrogram-layout';
import { getGraphPointByKey } from './font-point-index';
import { type GraphCoordinate, type GraphPointData } from './types';

/**
 * Derives the dendrogram-mode line segments from the session's full merge
 * tree (`appState.dendrogram`) and the radial layout (`dendrogram-layout`).
 *
 * Every merge draws as a bracket rather than a V: an arc at the merge's
 * radius spanning its children's angles, plus one radial spoke from each
 * child in to that arc — the classic circular-dendrogram elbow. Spokes and
 * arcs are separate GL draw specs so arcs can render as one analytic SDF quad
 * instead of many short chords.
 *
 * Leaves missing from the layout (not analysed, or hidden by a filter) simply
 * don't take part; a merge with a single visible child passes through as a
 * plain spoke.
 */

/** One straight spoke segment of the radial tree, in graph space (y-down). */
export interface DendrogramEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Zero-based rank of the merge this edge belongs to, in linkage order
   *  (ascending dissimilarity). Edges are emitted in this order. */
  mergeIndex: number;
  /** Clustering shared by every visible point under the merged node;
   *  undefined when the merge spans clusters (or has unclustered points). */
  clustering: ClusterColoring | undefined;
}

/** One circular arc of the radial tree, in graph-space polar coordinates. */
export interface DendrogramArc {
  /** Start angle in radians, graph-space y-down. */
  angleFrom: number;
  /** End angle in radians, graph-space y-down. */
  angleTo: number;
  /** Arc radius in graph units. */
  radius: number;
  /** Zero-based rank of the merge this arc belongs to. */
  mergeIndex: number;
  /** Clustering shared by every visible point under the merged node;
   *  undefined when the merge spans clusters (or has unclustered points). */
  clustering: ClusterColoring | undefined;
}

/** Resolved state of one dendrogram node (leaves first, then one per merge). */
interface ClusterNode {
  center: GraphCoordinate | null;
  angle: number;
  radius: number;
  /** Clustering shared by every visible leaf under this node; undefined when
   *  the node spans clusters (or has unclustered leaves). */
  clustering: ClusterColoring | undefined;
  /** Node index of the merge that absorbed this node; `-1` for the root. */
  parent: number;
  /** Leaf index of this node's recorded representative font. */
  rep: number;
}

/** One merge-node alias of the radial tree, drawn as a data dot. */
export interface DendrogramNodeDot extends GraphPointData {
  /** Unique graph-point key for this merge node alias. */
  key: string;
  /** Dendrogram node index of the merge (leaf count + merge rank). */
  nodeIndex: number;
  /** Sample folder name of the representative leaf's font. */
  safeName: string;
  /** Representative font's clustering, so merge nodes read like aliases of
   *  the graph points whose sample they carry. */
  clustering: ClusterColoring | undefined;
  /** Zero-based rank of the node's merge. */
  mergeIndex: number;
}

/** A merge node as a graph-point alias of its representative font. */
export type DendrogramImageAnchor = DendrogramNodeDot;

/** One leaf's name label, placed radially just outside the leaf ring. */
export interface DendrogramLeafLabel {
  /** Graph-point key (sample safe name) of the leaf's font. */
  key: string;
  /** The font name drawn as the label. */
  text: string;
  /** Polar angle of the leaf on the ring (graph space, y-down). */
  angle: number;
  /** Ring radius of the leaf. */
  radius: number;
  /** Clustering of the leaf's font; undefined when unclustered. */
  clustering: ClusterColoring | undefined;
}

interface DendrogramTree {
  edges: DendrogramEdge[];
  arcs: DendrogramArc[];
  nodes: ClusterNode[];
  leafIndexByKey: Map<string, number>;
  /** Anchors at every visible merge node, carrying the node's
   *  representative's sample. */
  imageAnchors: DendrogramImageAnchor[];
  /** One dot per visible merge node, in merge order. */
  dots: DendrogramNodeDot[];
  /** One name label per visible leaf, in leaf order. */
  labels: DendrogramLeafLabel[];
  /** Leaf order of the dendrogram (`ids[rep]` is a rep's safe name). */
  ids: string[];
}

const NO_ANCESTRY: GraphCoordinate[] = [];
const NO_EDGES: DendrogramEdge[] = [];
const NO_ARCS: DendrogramArc[] = [];
const NO_ANCHORS: DendrogramImageAnchor[] = [];
const NO_DOTS: DendrogramNodeDot[] = [];
const NO_LABELS: DendrogramLeafLabel[] = [];

/** Two points closer than this (in graph units) count as coincident. */
const COINCIDENT_EPSILON = 1e-6;

function isCoincident(a: GraphCoordinate, b: GraphCoordinate): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < COINCIDENT_EPSILON;
}

/** Clustering of a node whose children carry `left`/`right`; mixing two
 *  different clusters (or anything unclustered) yields `undefined`. */
function combineClustering(
  left: ClusterNode,
  right: ClusterNode,
): ClusterColoring | undefined {
  if (!left.center) return right.clustering;
  if (!right.center) return left.clustering;
  return left.clustering?.k === right.clustering?.k
    ? left.clustering
    : undefined;
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
      clustering:
        getGraphPointByKey(id)?.item.computed?.clustering ?? undefined,
      parent: -1,
      rep: index,
    }));

    // A name label at every visible leaf. The canonical name-table font name
    // is used as-is (names are recorded in English).
    const labels: DendrogramLeafLabel[] = [];
    for (const [index, id] of dendrogram.ids.entries()) {
      const leaf = nodes[index]!;
      if (!leaf.center) continue;
      const fontName = getGraphPointByKey(id)?.item.meta.font_name;
      if (!fontName) continue;
      labels.push({
        key: id,
        text: fontName,
        angle: leaf.angle,
        radius: leaf.radius,
        clustering: leaf.clustering,
      });
    }

    const edges: DendrogramEdge[] = [];
    const arcs: DendrogramArc[] = [];
    const pushPolyline = (
      points: GraphCoordinate[],
      mergeIndex: number,
      clustering: ClusterColoring | undefined,
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
          clustering,
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
          clustering: undefined,
          parent: -1,
          rep: 0,
        });
        continue;
      }

      const center = radial.nodeCenters[nodeIndex] ?? null;
      const angle = radial.nodeAngles[nodeIndex] ?? Number.NaN;
      const radius = radial.nodeRadii[nodeIndex] ?? 0;
      const clustering = combineClustering(left, right);

      if (left.center && right.center) {
        // The bracket: a spoke from each child in to the merge's radius, and
        // the arc between the two elbows.
        const leftElbow = polarPoint(left.angle, radius);
        pushPolyline([left.center, leftElbow], mergeIndex, clustering);
        pushPolyline(
          [right.center, polarPoint(right.angle, radius)],
          mergeIndex,
          clustering,
        );
        if (
          radius > COINCIDENT_EPSILON &&
          Math.abs(right.angle - left.angle) > COINCIDENT_EPSILON
        ) {
          arcs.push({
            angleFrom: left.angle,
            angleTo: right.angle,
            radius,
            mergeIndex,
            clustering,
          });
        }
      } else if (center) {
        // One side hidden: the merge passes through as a plain spoke.
        const child = left.center ? left : right;
        pushPolyline([child.center!, center], mergeIndex, clustering);
      }

      left.parent = nodeIndex;
      right.parent = nodeIndex;
      nodes.push({
        center,
        angle,
        radius,
        clustering,
        parent: -1,
        rep: merge.representative,
      });
    }

    // An alias point at every visible merge node carrying its representative's
    // sample — the same font deliberately repeats along the chain of merges
    // it keeps representing. And one dot per visible merge node, sample or
    // not, so every branch point reads as an actual point.
    const imageAnchors: DendrogramImageAnchor[] = [];
    const dots: DendrogramNodeDot[] = [];
    for (const [nodeIndex, node] of nodes.entries()) {
      if (nodeIndex < leafCount || !node.center) continue;
      const merge = dendrogram.merges[nodeIndex - leafCount];
      if (!merge || merge.height <= COINCIDENT_EPSILON) continue;
      const safeName = dendrogram.ids[node.rep];
      const representativePoint = safeName
        ? getGraphPointByKey(safeName)
        : undefined;
      if (!representativePoint || !safeName) continue;
      const alias = {
        key: `dendrogram:${nodeIndex}`,
        nodeIndex,
        safeName,
        item: representativePoint.item,
        x: node.center.x,
        y: node.center.y,
        clustering:
          representativePoint.item.computed?.clustering ?? node.clustering,
        mergeIndex: nodeIndex - leafCount,
      };
      dots.push(alias);
      imageAnchors.push(alias);
    }

    const leafIndexByKey = new Map(
      dendrogram.ids.map((id, index) => [id, index]),
    );

    return {
      edges,
      arcs,
      nodes,
      leafIndexByKey,
      imageAnchors,
      dots,
      labels,
      ids: dendrogram.ids,
    };
  });
  return memo;
});

/**
 * One straight spoke segment per drawable radial tree edge, in graph space
 * (y-down), ordered by merge rank. Empty when the dendrogram mode is inactive
 * or the session has no recorded dendrogram.
 */
export const dendrogramEdges = (): DendrogramEdge[] =>
  dendrogramTree()?.edges ?? NO_EDGES;

/**
 * One analytic circular arc per visible two-child merge, in graph-space polar
 * coordinates. Empty when the dendrogram mode is inactive or the session has no
 * recorded dendrogram.
 */
export const dendrogramArcs = (): DendrogramArc[] =>
  dendrogramTree()?.arcs ?? NO_ARCS;

/**
 * One image anchor per visible merge node (see
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
 * One name label per visible leaf (see {@link DendrogramLeafLabel}), in leaf
 * order. Empty when the dendrogram mode is inactive or the session has no
 * recorded dendrogram.
 */
export const dendrogramLeafLabels = (): DendrogramLeafLabel[] =>
  dendrogramTree()?.labels ?? NO_LABELS;

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
