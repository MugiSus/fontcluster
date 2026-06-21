import {
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  type Object3D,
} from 'three';

/** Half-length of each axis line — large enough to always span the viewport. */
const AXIS_EXTENT = 1_000_000;
// Full opacity so the line is exactly `--border`, not diluted by the background.
const AXIS_OPACITY = 1;
// Hex equivalents of the `--border` HSL values in index.css (light / dark).
const BORDER_LIGHT = '#d6dee9';
const BORDER_DARK = '#333338';

/**
 * The origin crosshair: a horizontal and vertical reference line through graph
 * (0, 0). Rendered behind the points (renderOrder -1) so it never sits in front
 * of the cloud. Native 1px lines, recolored per theme to match `--border`.
 */
export interface AxisLayer {
  /** The three.js object to add to the scene. */
  readonly object: Object3D;
  /** Positions the crosshair at the graph-space origin (y is negated to world). */
  setOrigin(x: number, y: number): void;
  /** Recolors the lines for the active theme. */
  setTheme(isLight: boolean): void;
  /** Releases GPU resources. */
  dispose(): void;
}

/** Creates the {@link AxisLayer}. */
export function createAxisLayer(): AxisLayer {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(
      [
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
      ],
      3,
    ),
  );
  const material = new LineBasicMaterial({
    transparent: true,
    opacity: AXIS_OPACITY,
    depthTest: false,
    depthWrite: false,
  });

  const lines = new LineSegments(geometry, material);
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
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
