import { type Accessor, createEffect, createSignal, onCleanup } from 'solid-js';
import { Color, Group, NormalBlending, type Object3D } from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { type DendrogramEdge } from '@/components/graph/dendrogram-edges';
import { getBackgroundColor, getClusterColor } from './cluster-colors-gl';

/** Stroke width in CSS px; fat lines keep a solid core (see axis-layer). */
const EDGE_WIDTH_PX = 1;
/** Uniform opacity on top of the per-segment fade, so crossing segments blend
 *  instead of the later (coarser) one occluding the finer one. */
const EDGE_OPACITY = 0.8;
/** Per-segment fade: the finest merge draws at NEAR, the coarsest at FAR. The
 *  fade is baked into the vertex colors as a lerp towards the background, so
 *  the tree recedes with depth without needing per-vertex alpha. */
const FADE_NEAR = 0.75;
const FADE_FAR = 0.12;

export interface DendrogramLayerProps {
  /** The edges to draw, in graph space (y-down), ordered by merge rank. */
  edges: Accessor<DendrogramEdge[]>;
  /** Merges to show: edges of merge ranks at or past this are hidden. */
  visibleMerges: Accessor<number>;
  /** Whether the active theme is dark (picks cluster/background colors). */
  isDark: Accessor<boolean>;
  /** Viewport resolution `LineMaterial` needs for its pixel-space width. */
  resolution: Accessor<{ width: number; height: number }>;
  /** Schedules a repaint of the (on-demand) render loop. */
  requestRender: () => void;
}

/**
 * The dendrogram centroid tree: one line segment per child-to-parent link of
 * the clustering dendrogram (see `dendrogram-edges.ts`). Rendered between the
 * origin axes and the points (renderOrder -0.5) so the tree reads as a
 * backplate under the content.
 *
 * Two visual encodings are baked into per-segment vertex colors:
 * - merges whose subtree lies inside one final cluster take that cluster's
 *   color; merges spanning clusters fall back to the neutral gray that
 *   `getClusterColor` returns for `k = -1`;
 * - color fades towards the background with merge rank, so fine structure is
 *   vivid and the coarse trunks recede.
 *
 * `LineSegmentsGeometry` has no in-place resize, so each edge/theme change
 * swaps in a freshly built geometry and disposes the old one. The depth slider
 * (`visibleMerges`) never rebuilds: edges arrive sorted by merge rank, so it
 * just caps the geometry's `instanceCount` to the matching prefix. The render
 * loop owns the group's visibility (the mode toggle and the glow passes).
 */
export function createDendrogramLayer(props: DendrogramLayerProps): Object3D {
  const material = new LineMaterial({
    color: 0xffffff,
    linewidth: EDGE_WIDTH_PX,
    vertexColors: true,
    transparent: true,
    opacity: EDGE_OPACITY,
    depthTest: false,
    blending: NormalBlending,
  });

  const group = new Group();
  let lines: LineSegments2 | null = null;
  // Downstream notification that the geometry was swapped, so the prefix
  // effect below re-applies the depth cap to the fresh (full) geometry.
  const [built, setBuilt] = createSignal<{
    lines: LineSegments2;
    edges: DendrogramEdge[];
  } | null>(null);

  createEffect(() => {
    const edges = props.edges();
    const isDark = props.isDark();
    if (lines) {
      group.remove(lines);
      lines.geometry.dispose();
      lines = null;
    }
    if (edges.length > 0) {
      const lastMergeIndex = edges[edges.length - 1]!.mergeIndex || 1;
      const background = new Color(getBackgroundColor({ isDark }));
      const segmentColor = new Color();

      // World Y is the negated graph Y (graph space is y-down).
      const positions = edges.flatMap(({ x1, y1, x2, y2 }) => [
        x1,
        -y1,
        0,
        x2,
        -y2,
        0,
      ]);
      const colors = edges.flatMap(({ mergeIndex, k }) => {
        const fade =
          FADE_NEAR - (FADE_NEAR - FADE_FAR) * (mergeIndex / lastMergeIndex);
        segmentColor.set(getClusterColor({ k, isDark }));
        segmentColor.lerpColors(background, segmentColor, fade);
        const { r, g, b } = segmentColor;
        return [r, g, b, r, g, b];
      });

      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(positions);
      geometry.setColors(colors);
      lines = new LineSegments2(geometry, material);
      lines.frustumCulled = false;
      lines.renderOrder = -0.5;
      group.add(lines);
    }
    setBuilt(lines ? { lines, edges } : null);
    props.requestRender();
  });

  // Depth cap: draw only the edge prefix whose merge rank is below the limit.
  createEffect(() => {
    const current = built();
    if (!current) return;
    current.lines.geometry.instanceCount = countEdgesBelow(
      current.edges,
      props.visibleMerges(),
    );
    props.requestRender();
  });

  createEffect(() => {
    const { width, height } = props.resolution();
    if (width > 0 && height > 0) material.resolution.set(width, height);
    props.requestRender();
  });

  onCleanup(() => {
    lines?.geometry.dispose();
    material.dispose();
  });

  return group;
}

/** First index whose merge rank reaches `mergeLimit` — the count of edges to
 *  draw, given `edges` is sorted by merge rank. */
function countEdgesBelow(edges: DendrogramEdge[], mergeLimit: number): number {
  let low = 0;
  let high = edges.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (edges[mid]!.mergeIndex < mergeLimit) low = mid + 1;
    else high = mid;
  }
  return low;
}
