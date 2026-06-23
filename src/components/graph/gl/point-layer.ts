import { type Accessor, createEffect, onCleanup, untrack } from 'solid-js';
import {
  AddEquation,
  AdditiveBlending,
  BufferGeometry,
  CustomBlending,
  Float32BufferAttribute,
  NormalBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Points,
  ShaderMaterial,
} from 'three';
import { type FontWeight } from '../../../types/font';
import { type GraphPointData } from '../types';
import { getClusterColor } from './cluster-colors-gl';
import { pointFragmentShader, pointVertexShader } from './point-shaders';

/** Sprite diameter (CSS px) = the blur/glow extent. */
const SIZE = 128;
/** Solid core (data dot) diameter (CSS px), independent of the blur radius. */
const CORE = 3.5;
/** Peak opacity at the glow center (it fades out from here). */
const GLOW_OPACITY = 0.1;

export interface PointLayerProps {
  points: Accessor<GraphPointData[]>;
  /** Whether the active theme is dark (drives colors and additive glow). */
  isDark: Accessor<boolean>;
  filteredKeys: Accessor<Set<string>>;
  activeWeights: Accessor<FontWeight[]>;
  /** Whether the halo glow is on (off = just the core dots). */
  glow: Accessor<boolean>;
  /** Schedules a repaint of the (on-demand) render loop. */
  requestRender: () => void;
}

/**
 * The point cloud: every graph node as one vertex in a single draw call.
 *
 * Two per-vertex attributes drive appearance:
 * - `aColor` — the cluster color (rebuilt with the point set / theme).
 * - `aState` — 0 for active points, 1 for dimmed (filtered-out / inactive
 *   weight) points.
 *
 * Colors, dimmed state, theme blending and glow all follow their accessors via
 * effects. {@link PointLayer.setPass} and {@link PointLayer.setPixelRatio} stay
 * imperative because they are driven by the render loop (the dark-mode bloom
 * pipeline switches passes and sprite scale per frame), not by reactive state.
 */
export interface PointLayer {
  /** The three.js object to add to the (bloomed) scene. */
  readonly object: Points;
  /**
   * Selects which part of the sprite to draw, and the matching blend mode, for
   * the dark-mode bloom pipeline (see the orchestrator's render loop):
   * - `combined` — core + halo in one sprite (light mode / glow off).
   * - `core` — the sharp data dot only, normal-blended.
   * - `halo` — the glow only, additively blended (into the half-float buffer).
   */
  setPass(pass: 'combined' | 'core' | 'halo'): void;
  /** Keeps the sprite size constant in CSS pixels across device pixel ratios. */
  setPixelRatio(pixelRatio: number): void;
}

/** Creates the {@link PointLayer}. */
export function createPointLayer(props: PointLayerProps): PointLayer {
  const geometry = new BufferGeometry();
  const material = new ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: 1 },
      uSize: { value: SIZE },
      uCore: { value: CORE },
      uOpacity: { value: GLOW_OPACITY },
      uGlowEnabled: { value: 1 },
      uPass: { value: 0 },
    },
    vertexShader: pointVertexShader,
    fragmentShader: pointFragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: NormalBlending,
  });

  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 0;

  // Additive blending exists only for the dark-mode glow. In light mode, or
  // whenever the glow is off (just the core dots), use normal blending so dots
  // show their true, un-brightened color.
  let darkMode = false;
  let glowEnabled = true;
  const updateBlending = () => {
    material.blending =
      darkMode && glowEnabled ? AdditiveBlending : NormalBlending;
    material.needsUpdate = true;
  };

  /**
   * Rebuilds the position buffer for a new point set and allocates the color /
   * state buffers (filled by setColors / setActiveState). Resets color and state
   * to zero, so callers must re-apply both after calling this.
   */
  const setPoints = (pointData: GraphPointData[]) => {
    const count = pointData.length;
    const positions = new Float32Array(count * 3);
    for (const [index, point] of pointData.entries()) {
      positions[index * 3] = point.x;
      // Graph space is y-down; negate so the world is y-up for the camera.
      positions[index * 3 + 1] = -point.y;
      positions[index * 3 + 2] = 0;
    }

    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    // Color and state are filled separately; allocate them empty so those
    // updates can write in place without reallocating.
    geometry.setAttribute(
      'aColor',
      new Float32BufferAttribute(new Float32Array(count * 3), 3),
    );
    geometry.setAttribute(
      'aState',
      new Float32BufferAttribute(new Float32Array(count), 1),
    );
    geometry.setDrawRange(0, count);
  };

  /** Updates the per-point color in place; call on theme change. */
  const setColors = (pointData: GraphPointData[], isDark: boolean) => {
    const attribute = geometry.getAttribute('aColor');
    // Guard against running before the matching geometry has been built.
    if (!attribute || attribute.count !== pointData.length) return;

    const colors = attribute.array as Float32Array;
    for (const [index, point] of pointData.entries()) {
      const hex = getClusterColor({
        k: point.item.computed?.clustering?.k,
        isDark,
      });
      colors[index * 3] = ((hex >> 16) & 0xff) / 255;
      colors[index * 3 + 1] = ((hex >> 8) & 0xff) / 255;
      colors[index * 3 + 2] = (hex & 0xff) / 255;
    }
    attribute.needsUpdate = true;
  };

  /** Updates only the active/dimmed flag per point (cheap, no realloc). */
  const setActiveState = (
    pointData: GraphPointData[],
    isActive: (point: GraphPointData) => boolean,
  ) => {
    const attribute = geometry.getAttribute('aState');
    // Guard against running before the matching geometry has been built.
    if (!attribute || attribute.count !== pointData.length) return;

    const states = attribute.array as Float32Array;
    for (const [index, point] of pointData.entries()) {
      states[index] = isActive(point) ? 0 : 1;
    }
    attribute.needsUpdate = true;
  };

  // Geometry (point set changed). setPoints reallocates the color/state buffers
  // to zero, so re-apply both right here from the *same* points array —
  // otherwise a rebuilt buffer can be left at the zero (black) default if the
  // dedicated effects below don't run in this same flush (e.g. across a session
  // switch). Theme / filter are read untracked so this effect only re-runs on a
  // point-set change; the effects below own those.
  createEffect(() => {
    const pointData = props.points();
    setPoints(pointData);
    untrack(() => {
      setColors(pointData, props.isDark());
      setActiveState(
        pointData,
        makeActivePredicate(
          props.filteredKeys(),
          new Set(props.activeWeights()),
        ),
      );
    });
    props.requestRender();
  });

  // Colors (theme / clustering changed). The geometry effect seeds colors on a
  // point-set change; this keeps them current when the theme flips or clustering
  // loads in later (setColors reads each point's clustering).
  createEffect(() => {
    setColors(props.points(), props.isDark());
    props.requestRender();
  });

  // Theme blending: additive glow only in dark mode with glow on.
  createEffect(() => {
    darkMode = props.isDark();
    updateBlending();
    props.requestRender();
  });

  // Glow on/off (enables the bloom pipeline in the render loop).
  createEffect(() => {
    glowEnabled = props.glow();
    material.uniforms['uGlowEnabled']!.value = glowEnabled ? 1 : 0;
    updateBlending();
    props.requestRender();
  });

  // Active/dimmed state (filter / active weights).
  createEffect(() => {
    setActiveState(
      props.points(),
      makeActivePredicate(props.filteredKeys(), new Set(props.activeWeights())),
    );
    props.requestRender();
  });

  onCleanup(() => {
    geometry.dispose();
    material.dispose();
  });

  return {
    object: points,

    setPass(pass) {
      // Set blending directly (not via updateBlending) since this runs per
      // frame; changing the blend factors alone needs no shader recompile.
      if (pass === 'core') {
        material.uniforms['uPass']!.value = 1;
        material.blending = NormalBlending;
      } else if (pass === 'halo') {
        // The halo outputs premultiplied alpha (see shader), so src factor stays
        // One and only the dst factor selects the operator: One = additive (dark
        // glow), OneMinusSrcAlpha = 'over' = normal blending (light glow). Both
        // accumulate into a transparent buffer.
        material.uniforms['uPass']!.value = 2;
        material.blending = CustomBlending;
        material.blendEquation = AddEquation;
        material.blendSrc = OneFactor;
        material.blendDst = darkMode ? OneFactor : OneMinusSrcAlphaFactor;
      } else {
        material.uniforms['uPass']!.value = 0;
        updateBlending();
      }
    },

    setPixelRatio(pixelRatio) {
      material.uniforms['uPixelRatio']!.value = pixelRatio;
    },
  };
}

/** Builds the active-state predicate from the current filter + weight set. */
export function makeActivePredicate(
  filteredKeys: Set<string>,
  activeWeights: Set<FontWeight>,
): (point: GraphPointData) => boolean {
  return (point) =>
    filteredKeys.has(point.key) &&
    activeWeights.has(point.item.meta.weight as FontWeight);
}
