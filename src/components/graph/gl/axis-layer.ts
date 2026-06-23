import { type Accessor, createEffect, onCleanup } from 'solid-js';
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

export interface AxisLayerProps {
  /** Graph-space origin the crosshair is centered on (y is negated to world). */
  origin: Accessor<{ x: number; y: number }>;
  /** Whether the active theme is light (picks the border color). */
  isLight: Accessor<boolean>;
  /** Viewport resolution `LineMaterial` needs for its pixel-space width. */
  resolution: Accessor<{ width: number; height: number }>;
  /** Schedules a repaint of the (on-demand) render loop. */
  requestRender: () => void;
}

/**
 * The origin crosshair: a horizontal and vertical reference line through graph
 * (0, 0). Rendered behind the points (renderOrder -1). Uses fat lines (Line2
 * family) so the stroke has a solid core and renders the exact `--border`
 * color, rather than a native 1px line that anti-aliases into the background.
 *
 * Origin, theme color and resolution all follow their accessors via effects.
 * Returns the scene object to add (there is nothing else to expose).
 */
export function createAxisLayer(props: AxisLayerProps): Object3D {
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

  // World Y is the negated graph Y (graph space is y-down).
  createEffect(() => {
    const { x, y } = props.origin();
    lines.position.set(x, -y, 0);
    props.requestRender();
  });
  createEffect(() => {
    material.color.set(props.isLight() ? BORDER_LIGHT : BORDER_DARK);
    props.requestRender();
  });
  createEffect(() => {
    const { width, height } = props.resolution();
    if (width > 0 && height > 0) material.resolution.set(width, height);
    props.requestRender();
  });

  onCleanup(() => {
    geometry.dispose();
    material.dispose();
  });

  return lines;
}
