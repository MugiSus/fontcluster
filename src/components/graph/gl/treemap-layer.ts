import { type Accessor, createEffect, onCleanup } from 'solid-js';
import { Color, Group, type Object3D } from 'three';
// Type-only: driven by the same custom ShaderMaterial as the other graph
// hairlines (see `createFatLineMaterial`).
import { type LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { GRAPH_SIZE } from '@/components/graph/constants';
import {
  type TreemapBoundary,
  type TreemapLeafCell,
} from '@/components/graph/treemap-layout';
import {
  getBackgroundColor,
  getClusterColor,
  getScatterGridColor,
} from './cluster-colors-gl';
import { createFatLineMaterial } from './dendrogram-layer';

const BOUNDARY_WIDTH_PX = 1;

export interface TreemapLayerProps {
  /** Equal-weight leaf rectangles produced by the hierarchy layout. */
  cells: Accessor<TreemapLeafCell[]>;
  /** One dividing segment per binary merge, without duplicate cell outlines. */
  boundaries: Accessor<TreemapBoundary[]>;
  /** Whether the active theme is dark (picks cell and boundary colors). */
  isDark: Accessor<boolean>;
  /** Viewport resolution the hairline shader needs for CSS-pixel width. */
  resolution: Accessor<{ width: number; height: number }>;
  /** Schedules a repaint of the on-demand renderer. */
  requestRender: () => void;
}

/**
 * Space-filling treemap backplate. Leaf area represents descendant font count:
 * every font contributes the same value in `treemap-layout`. The hierarchy is
 * shown by a single hairline at each binary split instead of outlining every
 * ancestor rectangle, plus one border-colored frame around the full layout.
 * Cells have no fill so point glow, labels and sample images retain the graph's
 * visual priority. All geometry is derived render data; this layer never
 * mutates graph or session state.
 */
export function createTreemapLayer(props: TreemapLayerProps): Object3D {
  const group = new Group();
  const boundaryMaterial = createFatLineMaterial({
    color: 0xffffff,
    linewidth: BOUNDARY_WIDTH_PX,
    opacity: 1,
    hasVertexColors: true,
  });
  let lines: LineSegments2 | null = null;

  createEffect(() => {
    const boundaries = props.boundaries();
    const isDark = props.isDark();
    if (lines) {
      group.remove(lines);
      lines.geometry.dispose();
      lines = null;
    }
    if (props.cells().length > 0) {
      const positions = boundaries.flatMap(({ x1, y1, x2, y2 }) => [
        x1,
        -y1,
        0,
        x2,
        -y2,
        0,
      ]);
      positions.push(
        0,
        0,
        0,
        GRAPH_SIZE,
        0,
        0,
        GRAPH_SIZE,
        0,
        0,
        GRAPH_SIZE,
        -GRAPH_SIZE,
        0,
        GRAPH_SIZE,
        -GRAPH_SIZE,
        0,
        0,
        -GRAPH_SIZE,
        0,
        0,
        -GRAPH_SIZE,
        0,
        0,
        0,
        0,
      );

      const background = new Color(getBackgroundColor({ isDark }));
      const boundaryColor = new Color();
      const lastMergeIndex = boundaries.reduce(
        (last, boundary) => Math.max(last, boundary.mergeIndex),
        1,
      );
      const colors = boundaries.flatMap(({ colorIndex, mergeIndex }) => {
        boundaryColor.set(getClusterColor({ colorIndex, isDark }));
        boundaryColor.lerpColors(
          background,
          boundaryColor,
          0.35 + 0.45 * (mergeIndex / lastMergeIndex),
        );
        const { r, g, b } = boundaryColor;
        return [r, g, b, r, g, b];
      });
      // Exact `border` token color; the four final segments frame the entire
      // 0..GRAPH_SIZE treemap independently of its internal merge boundaries.
      const frame = new Color(getScatterGridColor({ isDark }));
      for (let edge = 0; edge < 4; edge += 1) {
        colors.push(frame.r, frame.g, frame.b, frame.r, frame.g, frame.b);
      }

      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(positions);
      geometry.setColors(colors);
      lines = new LineSegments2(
        geometry,
        boundaryMaterial as unknown as LineMaterial,
      );
      lines.frustumCulled = false;
      lines.renderOrder = -0.55;
      group.add(lines);
    }
    props.requestRender();
  });

  createEffect(() => {
    const { width, height } = props.resolution();
    if (width > 0 && height > 0) {
      boundaryMaterial.uniforms['resolution']!.value.set(width, height);
    }
    props.requestRender();
  });

  onCleanup(() => {
    lines?.geometry.dispose();
    boundaryMaterial.dispose();
  });

  return group;
}
