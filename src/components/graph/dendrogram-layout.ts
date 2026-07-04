import { createMemo, createRoot } from 'solid-js';
import { appState } from '@/store';
import { GRAPH_SIZE } from './constants';
import { type GraphCoordinate } from './types';

/**
 * Radial layout of the dendrogram mode — the classic circular dendrogram:
 * the tree's root sits at the centre of the graph, the leaves (sample points)
 * sit evenly spaced on an outer ring, ordered by a tree traversal so every
 * subtree occupies a contiguous arc, and each merge sits at the mean angle of
 * its children with a radius that shrinks towards the centre as its
 * dissimilarity grows.
 *
 * Only leaves present in the current display data take part (hidden leaves
 * give up their arc); a merge whose subtree is entirely hidden has no
 * position. Null when the dendrogram mode is off or the session has no
 * recorded dendrogram — the regular map layout applies then.
 */

export interface RadialDendrogramLayout {
  /** Ring position of every present leaf, keyed by font safe name. */
  positionByKey: Map<string, GraphCoordinate>;
  /** Position of every dendrogram node (leaves first, then one per merge);
   *  null for nodes without a visible member. */
  nodeCenters: (GraphCoordinate | null)[];
  /** Polar angle of every node; NaN for nodes without a visible member. */
  nodeAngles: number[];
  /** Polar radius of every node (leaves on the ring, merges sinking inward). */
  nodeRadii: number[];
}

const CENTER = GRAPH_SIZE / 2;
/** Ring radius of the leaves; matches the map layout's footprint. */
const LEAF_RADIUS = GRAPH_SIZE / 2;
/** The first leaf sits at the top of the ring. */
const START_ANGLE = -Math.PI / 2;
/** Longest chord used when tessellating arcs; short enough (a few px at the
 *  default zoom) that the polyline reads as a smooth circle. */
const MAX_ARC_CHORD = 3;
/** Strength of the logarithmic height scale used for merge radii. Hierarchical
 *  merge heights are typically dense near the leaves and sparse near the root;
 *  `log1p(9t) / log(10)` expands those low heights into more radial space while
 *  compressing the root side. */
const HEIGHT_LOG_STRENGTH = 9;

/** Graph-space point at a polar angle/radius around the ring centre. */
export function polarPoint(angle: number, radius: number): GraphCoordinate {
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle),
  };
}

/** The arc from `angleFrom` to `angleTo` at `radius`, as successive chord
 *  destinations: excludes the start point, includes the end. */
export function arcPoints(
  angleFrom: number,
  angleTo: number,
  radius: number,
): GraphCoordinate[] {
  const span = angleTo - angleFrom;
  const steps = Math.max(
    1,
    Math.ceil((Math.abs(span) * radius) / MAX_ARC_CHORD),
  );
  return Array.from({ length: steps }, (_, step) =>
    polarPoint(angleFrom + (span * (step + 1)) / steps, radius),
  );
}

export const radialDendrogramLayout = createRoot(() => {
  const memo = createMemo<RadialDendrogramLayout | null>(() => {
    if (!appState.ui.showDendrogram) return null;
    const dendrogram = appState.dendrogram;
    if (!dendrogram) return null;

    const { ids, merges } = dendrogram;
    const leafCount = ids.length;
    const nodeCount = leafCount + merges.length;
    const presentKeys = new Set(Object.keys(appState.fonts.displayData));

    // Bottom-up pass: visible-leaf count per node. Merges only reference
    // earlier nodes, so plain index order is already topological.
    const visibleCounts: number[] = ids.map((id) =>
      presentKeys.has(id) ? 1 : 0,
    );
    const hasParent = new Array<boolean>(nodeCount).fill(false);
    for (const merge of merges) {
      visibleCounts.push(
        (visibleCounts[merge.left] ?? 0) + (visibleCounts[merge.right] ?? 0),
      );
      hasParent[merge.left] = true;
      hasParent[merge.right] = true;
    }

    // A full linkage has a single root, but tolerate a forest: every root
    // gets an arc proportional to its visible leaves.
    const roots = visibleCounts.flatMap((count, node) =>
      count > 0 && !hasParent[node] ? [node] : [],
    );
    const totalVisible = roots.reduce(
      (sum, root) => sum + (visibleCounts[root] ?? 0),
      0,
    );
    if (totalVisible === 0) return null;

    // Top-down pass: visible leaves take consecutive ring slots in pre-order
    // (right child pushed first so the left subtree is walked first), which
    // keeps every subtree on a contiguous arc. Iterative — linkage chains can
    // be as deep as the leaf count.
    const angles = new Array<number>(nodeCount).fill(Number.NaN);
    let slot = 0;
    const stack: number[] = [];
    for (const root of roots) {
      stack.push(root);
      while (stack.length > 0) {
        const node = stack.pop()!;
        if ((visibleCounts[node] ?? 0) === 0) continue;
        if (node < leafCount) {
          angles[node] =
            START_ANGLE + (2 * Math.PI * (slot + 0.5)) / totalVisible;
          slot += 1;
          continue;
        }
        const merge = merges[node - leafCount]!;
        stack.push(merge.right, merge.left);
      }
    }

    // Bottom-up pass: a merge sits at the mean angle of its visible children.
    // Children's arcs are adjacent halves of the parent's arc, so the plain
    // arithmetic mean never crosses the 2π seam.
    for (const [mergeIndex, merge] of merges.entries()) {
      const left = angles[merge.left]!;
      const right = angles[merge.right]!;
      angles[leafCount + mergeIndex] = Number.isNaN(left)
        ? right
        : Number.isNaN(right)
          ? left
          : (left + right) / 2;
    }

    // Radius: leaves on the ring, merges sinking towards the centre with
    // dissimilarity. The raw linkage heights are usually dense near zero, so a
    // logarithmic progression spreads fine leaf-side structure outward and
    // compresses the sparse root-side structure. Some linkage methods can
    // produce inversions, so use the cumulative maximum height for a monotone
    // radial tree even when one merge's raw height dips below a previous step.
    let maxHeight = 0;
    const monotoneMergeHeights = merges.map((merge) => {
      maxHeight = Math.max(maxHeight, merge.height);
      return maxHeight;
    });
    const logDenominator = Math.log1p(HEIGHT_LOG_STRENGTH);
    const radiusOf = (node: number) => {
      if (node < leafCount) return LEAF_RADIUS;
      if (maxHeight <= 0) return 0;
      const normalizedHeight =
        (monotoneMergeHeights[node - leafCount] ?? 0) / maxHeight;
      const heightProgress =
        Math.log1p(HEIGHT_LOG_STRENGTH * normalizedHeight) / logDenominator;
      return LEAF_RADIUS * (1 - heightProgress);
    };

    const nodeRadii = angles.map((_, node) => radiusOf(node));
    const nodeCenters = angles.map((angle, node) =>
      Number.isNaN(angle) ? null : polarPoint(angle, nodeRadii[node]!),
    );

    const positionByKey = new Map<string, GraphCoordinate>();
    for (const [index, id] of ids.entries()) {
      const center = nodeCenters[index];
      if (center) positionByKey.set(id, center);
    }

    return { positionByKey, nodeCenters, nodeAngles: angles, nodeRadii };
  });
  return memo;
});
