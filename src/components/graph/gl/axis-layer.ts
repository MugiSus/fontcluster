import { NormalBlending, type Object3D } from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';

/** Half-length of each axis line — large enough to always span the viewport. */
const AXIS_EXTENT = 100_000;
/** Stroke width in CSS px. Native 1px lines wash out (their color blends with
 *  the background via anti-aliasing), so a fat line with a solid core keeps the
 *  color accurate. */
const AXIS_WIDTH_PX = 1;
const AXIS_OPACITY = 1;
// 0xRRGGBB equivalents of the `--border` HSL values in index.css (light / dark).
const BORDER_LIGHT = 0xd6dee9;
const BORDER_DARK = 0x333338;

/**
 * The origin crosshair: a horizontal and vertical reference line through graph
 * (0, 0). Rendered behind the points (renderOrder -1). Uses fat lines (Line2
 * family) so the stroke has a solid core and renders the exact `--border`
 * color, rather than a native 1px line that anti-aliases into the background.
 */
export interface AxisLayer {
  /** The three.js object to add to the scene. */
  readonly object: Object3D;
  /** Positions the crosshair at the graph-space origin (y is negated to world). */
  setOrigin(x: number, y: number): void;
  /** Recolors the lines for the active theme. */
  setTheme(isLight: boolean): void;
  /** Feeds the viewport resolution LineMaterial needs for its pixel width. */
  setResolution(width: number, height: number): void;
  /** Releases GPU resources. */
  dispose(): void;
}

/** Creates the {@link AxisLayer}. */
export function createAxisLayer(): AxisLayer {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions([
    -AXIS_EXTENT,
    0,
    0,
    AXIS_EXTENT,
    0,
    0, // horizontal line
    0,
    -AXIS_EXTENT,
    0,
    0,
    AXIS_EXTENT,
    0, // vertical line
  ]);

  const material = new LineMaterial({
    color: BORDER_DARK,
    linewidth: AXIS_WIDTH_PX,
    transparent: true,
    opacity: AXIS_OPACITY,
    depthTest: false,
    blending: NormalBlending,
  });

  const lines = new LineSegments2(geometry, material);
  lines.frustumCulled = false;
  lines.renderOrder = -1;

  return {
    object: lines,
    setOrigin(x, y) {
      // World Y is the negated graph Y (graph space is y-down).
      lines.position.set(x, -y, 0);
    },
    setTheme(isLight) {
      material.color.set(isLight ? BORDER_LIGHT : BORDER_DARK);
    },
    setResolution(width, height) {
      material.resolution.set(width, height);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
