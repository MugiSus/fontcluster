import { type Accessor, createEffect, onCleanup } from 'solid-js';
import { Color, Group, type Object3D } from 'three';
// Type-only: driven by our own `ShaderMaterial` (see `createFatLineMaterial`).
import { type LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { GRAPH_SIZE } from '@/components/graph/constants';
import { type ScatterGridLine } from '@/components/graph/types';
import { getBackgroundColor, getScatterGridColor } from './cluster-colors-gl';
import { createFatLineMaterial } from './dendrogram-layer';

/** Stroke width in CSS px — a hairline, like the dendrogram edges. */
const GRID_WIDTH_PX = 1;
const GRID_OPACITY = 1;
/** Minor (σ≠0) lines recede: their color sits this fraction of the way from
 *  the background towards the grid gray; the σ=0 mean cross draws at full
 *  grid gray. */
const MINOR_LINE_STRENGTH = 0.5;

export interface ScatterGridLayerProps {
  /** The σ gridlines to draw; empty in the dendrogram layout. */
  lines: Accessor<ScatterGridLine[]>;
  /** Whether the active theme is dark (picks the grid/background grays). */
  isDark: Accessor<boolean>;
  /** Viewport resolution the fat-line shader needs for its pixel-space width. */
  resolution: Accessor<{ width: number; height: number }>;
  /** Schedules a repaint of the (on-demand) render loop. */
  requestRender: () => void;
}

/**
 * The scatter layout's σ grid: one hairline per integer σ level of each axis,
 * projected through the same per-axis symlog scales as the points — so the
 * line spacing tightens towards the edges exactly where the layout compresses
 * its tails, making the nonlinearity readable instead of implicit. The σ=0
 * pair crosses at the collection mean and draws one step stronger.
 *
 * Deepest backplate (renderOrder -0.6, under the dendrogram edges' slot); the
 * render loop owns the group's visibility across the glow passes, treating it
 * like the dendrogram backplate. `LineSegmentsGeometry` has no in-place
 * resize, so each line/theme change swaps in freshly built geometry.
 */
export function createScatterGridLayer(props: ScatterGridLayerProps): Object3D {
  const material = createFatLineMaterial({
    color: 0xffffff,
    linewidth: GRID_WIDTH_PX,
    opacity: GRID_OPACITY,
    hasVertexColors: true,
  });

  const group = new Group();
  let lines: LineSegments2 | null = null;

  createEffect(() => {
    const gridLines = props.lines();
    const isDark = props.isDark();
    if (lines) {
      group.remove(lines);
      lines.geometry.dispose();
      lines = null;
    }
    if (gridLines.length > 0) {
      const background = new Color(getBackgroundColor({ isDark }));
      const meanColor = new Color(getScatterGridColor({ isDark }));
      const minorColor = new Color().lerpColors(
        background,
        meanColor,
        MINOR_LINE_STRENGTH,
      );

      // World Y is the negated graph Y (graph space is y-down).
      const positions = gridLines.flatMap((line) =>
        line.axis === 'x'
          ? [line.position, 0, 0, line.position, -GRAPH_SIZE, 0]
          : [0, -line.position, 0, GRAPH_SIZE, -line.position, 0],
      );
      const colors = gridLines.flatMap((line) => {
        const { r, g, b } = line.sigma === 0 ? meanColor : minorColor;
        return [r, g, b, r, g, b];
      });

      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(positions);
      geometry.setColors(colors);
      lines = new LineSegments2(geometry, material as unknown as LineMaterial);
      lines.frustumCulled = false;
      lines.renderOrder = -0.6;
      group.add(lines);
    }
    props.requestRender();
  });

  createEffect(() => {
    const { width, height } = props.resolution();
    if (width > 0 && height > 0) {
      material.uniforms['resolution']!.value.set(width, height);
    }
    props.requestRender();
  });

  onCleanup(() => {
    lines?.geometry.dispose();
    material.dispose();
  });

  return group;
}
