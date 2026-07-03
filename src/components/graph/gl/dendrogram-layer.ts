import { type Accessor, createEffect, onCleanup } from 'solid-js';
import { Group, NormalBlending, type Object3D } from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { type DendrogramEdge } from '@/components/graph/dendrogram-edges';

/** Stroke width in CSS px; fat lines keep a solid core (see axis-layer). */
const EDGE_WIDTH_PX = 1;
/** Neutral zinc-500 — readable on both themes without competing with points. */
const EDGE_COLOR = 0x71717a;
/** Many edges overlap near cluster centres; a translucent stroke keeps the
 *  points readable underneath the tree. */
const EDGE_OPACITY = 0.35;

export interface DendrogramLayerProps {
  /** The edges to draw, in graph space (y-down). */
  edges: Accessor<DendrogramEdge[]>;
  /** Viewport resolution `LineMaterial` needs for its pixel-space width. */
  resolution: Accessor<{ width: number; height: number }>;
  /** Schedules a repaint of the (on-demand) render loop. */
  requestRender: () => void;
}

/**
 * The dendrogram edges: one line segment per merge of the clustering
 * dendrogram, connecting a representative point of each merged cluster (see
 * `dendrogram-edges.ts`). Rendered between the origin axes and the points
 * (renderOrder -0.5) so the tree reads as a backplate under the content.
 *
 * The segment set follows its accessor: `LineSegmentsGeometry` has no in-place
 * resize, so each change swaps in a freshly built geometry and disposes the old
 * one. The render loop owns the group's visibility (the mode toggle and the
 * glow passes); this layer only keeps its child in sync with the data.
 */
export function createDendrogramLayer(props: DendrogramLayerProps): Object3D {
  const material = new LineMaterial({
    color: EDGE_COLOR,
    linewidth: EDGE_WIDTH_PX,
    transparent: true,
    opacity: EDGE_OPACITY,
    depthTest: false,
    blending: NormalBlending,
  });

  const group = new Group();
  let lines: LineSegments2 | null = null;

  createEffect(() => {
    const edges = props.edges();
    if (lines) {
      group.remove(lines);
      lines.geometry.dispose();
      lines = null;
    }
    if (edges.length > 0) {
      // World Y is the negated graph Y (graph space is y-down).
      const positions = edges.flatMap(({ x1, y1, x2, y2 }) => [
        x1,
        -y1,
        0,
        x2,
        -y2,
        0,
      ]);
      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(positions);
      lines = new LineSegments2(geometry, material);
      lines.frustumCulled = false;
      lines.renderOrder = -0.5;
      group.add(lines);
    }
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
