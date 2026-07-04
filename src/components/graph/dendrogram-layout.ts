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
}

const CENTER = GRAPH_SIZE / 2;
/** Ring radius of the leaves; matches the map layout's footprint. */
const LEAF_RADIUS = GRAPH_SIZE / 2;
/** The first leaf sits at the top of the ring. */
const START_ANGLE = -Math.PI / 2;

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

    // Radius: leaves on the ring, merges sinking towards the centre linearly
    // with dissimilarity; the root (the highest merge) lands exactly on it.
    const maxHeight = merges[merges.length - 1]?.height ?? 0;
    const radiusOf = (node: number) => {
      if (node < leafCount) return LEAF_RADIUS;
      if (maxHeight <= 0) return 0;
      const height = merges[node - leafCount]!.height;
      return LEAF_RADIUS * (1 - height / maxHeight);
    };

    const nodeCenters = angles.map((angle, node) => {
      if (Number.isNaN(angle)) return null;
      const radius = radiusOf(node);
      return {
        x: CENTER + radius * Math.cos(angle),
        y: CENTER + radius * Math.sin(angle),
      };
    });

    const positionByKey = new Map<string, GraphCoordinate>();
    for (const [index, id] of ids.entries()) {
      const center = nodeCenters[index];
      if (center) positionByKey.set(id, center);
    }

    return { positionByKey, nodeCenters };
  });
  return memo;
});
