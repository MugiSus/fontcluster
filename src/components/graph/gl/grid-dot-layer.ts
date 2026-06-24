import { type Accessor, createEffect, onCleanup } from 'solid-js';
import {
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';
import { type GraphCoordinate } from '../types';
import { getBorderColor } from './graph-colors-gl';
import { gridDotFragmentShader, gridDotVertexShader } from './grid-dot-shaders';

/** Half-length of the grid plane in graph units. Matches the axis extent scale. */
const GRID_EXTENT = 100_000;
/** Raw-coordinate spacing between reference dots before graph-space scaling. */
const RAW_GRID_STEP = 0.5;
/** Dot radius in CSS pixels; the shader converts graph distance back to pixels. */
const DOT_RADIUS_CSS_PX = 1;
/** Whole-dot opacity. Kept at 1 so the dot core is exactly the border color. */
const DOT_OPACITY = 1;

export interface GridDotLayerProps {
  /** Graph-space location of raw coordinate (0, 0), shared with the axis layer. */
  origin: Accessor<GraphCoordinate>;
  /** Number of graph units that represent one raw coordinate unit. */
  graphUnitsPerRawUnit: Accessor<number>;
  /** Whether the active theme is light; selects the matching border token color. */
  isLight: Accessor<boolean>;
  /** Graph units per CSS pixel; keeps dot size screen-stable while zooming. */
  zoom: Accessor<number>;
  /** Schedules a repaint of the on-demand renderer. */
  requestRender: () => void;
}

/**
 * Creates the passive raw-coordinate reference grid.
 *
 * The layer draws one large plane and lets {@link gridDotFragmentShader}
 * generate the repeated dots procedurally. No point geometry is allocated for
 * the individual grid marks; the only state this layer owns is GPU material
 * state derived from the current theme, raw-to-graph scale and viewport zoom.
 */
export function createGridDotLayer(props: GridDotLayerProps): Mesh {
  const geometry = new PlaneGeometry(GRID_EXTENT * 2, GRID_EXTENT * 2);
  const material = new ShaderMaterial({
    uniforms: {
      uColor: { value: new Vector3() },
      uGraphUnitsPerPixel: { value: 1 },
      uOpacity: { value: DOT_OPACITY },
      uOrigin: { value: [0, 0] },
      uRadiusPx: { value: DOT_RADIUS_CSS_PX },
      uStep: { value: 1 },
    },
    vertexShader: gridDotVertexShader,
    fragmentShader: gridDotFragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: NormalBlending,
  });

  const dots = new Mesh(geometry, material);
  dots.frustumCulled = false;
  dots.renderOrder = -2;

  /** Keeps the dot color in lockstep with the WebGL border color. */
  createEffect(() => {
    const hex = getBorderColor({ isDark: !props.isLight() });
    (material.uniforms['uColor']!.value as Vector3).set(
      ((hex >> 16) & 0xff) / 255,
      ((hex >> 8) & 0xff) / 255,
      (hex & 0xff) / 255,
    );
    props.requestRender();
  });

  /** Anchors the grid to raw (0, 0) and maps raw 0.5-unit spacing to graph units. */
  createEffect(() => {
    const origin = props.origin();
    material.uniforms['uOrigin']!.value = [origin.x, origin.y];
    material.uniforms['uStep']!.value =
      RAW_GRID_STEP * props.graphUnitsPerRawUnit();
    props.requestRender();
  });

  /** Updates the graph-units-per-pixel conversion used by the anti-aliased SDF. */
  createEffect(() => {
    material.uniforms['uGraphUnitsPerPixel']!.value = props.zoom();
    props.requestRender();
  });

  onCleanup(() => {
    geometry.dispose();
    material.dispose();
  });

  return dots;
}
