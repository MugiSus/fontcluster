import { type Accessor, createEffect, onCleanup, untrack } from 'solid-js';
import {
  AddEquation,
  BufferGeometry,
  CustomBlending,
  Float32BufferAttribute,
  NormalBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Points,
  ShaderMaterial,
} from 'three';
import { type GraphPointData } from '@/components/graph/types';
import {
  getClusterColor,
  type GraphOutputColorSpace,
} from './cluster-colors-gl';
import {
  coreFragmentShader,
  coreVertexShader,
  haloFragmentShader,
  haloVertexShader,
} from './shaders/point';

/** Sprite diameter (CSS px) = the blur/glow extent. */
const SIZE = 128;
/** Solid core (data dot) diameter (CSS px), independent of the blur radius. */
const CORE = 3.5;
/**
 * Peak opacity at the glow center (it fades out from here). This is the punch of
 * a *single* halo; the whole glow layer is capped separately by the compositor's
 * GLOW_LAYER_OPACITY when the bloom buffer is blitted to the screen, so this can
 * run higher without dense overlaps painting the layer fully opaque.
 */
const GLOW_OPACITY = 0.2;
const FULL_OPACITY = () => 1;

export interface PointLayerProps {
  points: Accessor<GraphPointData[]>;
  /** Whether sharp core dots are drawn; the halo remains independent. */
  showCore: Accessor<boolean>;
  /** Encoded RGB space of the renderer's drawing buffer. */
  colorSpace: GraphOutputColorSpace;
  /** Marks a point active (full) vs dimmed (filtered-out / inactive weight). */
  activePredicate: Accessor<(point: GraphPointData) => boolean>;
  /** Extra per-point opacity multiplier; defaults to fully opaque. */
  opacityForPoint?: Accessor<(point: GraphPointData) => number>;
  /** Keys whose sample image is drawn; their core dot is hidden (glow stays). */
  imageShownKeys: Accessor<Set<string>>;
  /** Device pixel ratio; sprite size = CSS px × this. */
  pixelRatio: Accessor<number>;
  /** The glow buffer's resolution scale (applied to the halo sprite in-shader). */
  glowScale: number;
  /** Schedules a repaint of the (on-demand) render loop. */
  requestRender: () => void;
}

/**
 * The point cloud: every graph node as one vertex, drawn in two single-purpose
 * objects that share one geometry:
 * - {@link PointLayer.core} — the sharp data dot (normal-blended to the screen).
 * - {@link PointLayer.halo} — the soft glow (premultiplied, accumulated into the
 *   bloom buffer). Only rendered when the glow is on.
 *
 * Three per-vertex attributes drive appearance:
 * - `aColor` — the cluster color (rebuilt with the point set / theme).
 * - `aState` — 0 for active points, 1 for dimmed (filtered-out / inactive
 *   weight) points.
 * - `aOpacity` — an extra per-point opacity multiplier, normally 1.
 * - `aHideCore` — 1 for points whose sample image is drawn (the core dot is
 *   suppressed there; only the core program reads it, so the glow still shows).
 *
 * Everything follows the accessors via effects; the render loop simply shows the
 * core or halo object per pass, so there is no imperative per-frame API.
 */
export interface PointLayer {
  /** The sharp data dots; drawn straight to the screen. */
  core: Points;
  /** The glow sprites; rendered into the bloom buffer when the glow is on. */
  halo: Points;
}

/** Creates the {@link PointLayer}. */
export function createPointLayer(props: PointLayerProps): PointLayer {
  // Constant config (the glow buffer's resolution scale), read once.
  // eslint-disable-next-line solid/reactivity -- a constant, never reactive
  const glowScale = props.glowScale;

  // One geometry shared by both objects: position + the color / state attributes
  // (filled by setColors / setActiveState).
  const geometry = new BufferGeometry();

  const coreMaterial = new ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: 1 },
      uCore: { value: CORE },
      uShowCore: { value: 1 },
    },
    vertexShader: coreVertexShader,
    fragmentShader: coreFragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: NormalBlending,
  });

  const haloMaterial = new ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: 1 },
      uGlowScale: { value: glowScale },
      uSize: { value: SIZE },
      uOpacity: { value: GLOW_OPACITY },
    },
    vertexShader: haloVertexShader,
    fragmentShader: haloFragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    // Premultiplied halos accumulate with normal 'over' blending (src One, dst
    // OneMinusSrcAlpha), so overlapping opacity asymptotes toward 1 and stays in
    // [0, 1]. The composite then multiplies that opacity by GLOW_LAYER_OPACITY
    // when it veils the screen.
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    premultipliedAlpha: true,
  });

  const core = new Points(geometry, coreMaterial);
  core.frustumCulled = false;
  core.renderOrder = 0;

  const halo = new Points(geometry, haloMaterial);
  halo.frustumCulled = false;
  halo.renderOrder = 0;

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
    geometry.setAttribute(
      'aOpacity',
      new Float32BufferAttribute(new Float32Array(count), 1),
    );
    geometry.setAttribute(
      'aHideCore',
      new Float32BufferAttribute(new Float32Array(count), 1),
    );
    geometry.setDrawRange(0, count);
  };

  /** Updates the per-point color in place. */
  const setColors = (pointData: GraphPointData[]) => {
    const attribute = geometry.getAttribute('aColor');
    // Guard against running before the matching geometry has been built.
    if (!attribute || attribute.count !== pointData.length) return;

    const colors = attribute.array as Float32Array;
    for (const [index, point] of pointData.entries()) {
      const color = getClusterColor({
        angle: point.colorAngle,
        colorSpace: props.colorSpace,
      });
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
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

  /** Updates only the extra opacity multiplier per point (cheap, no realloc). */
  const setOpacity = (
    pointData: GraphPointData[],
    opacityForPoint: (point: GraphPointData) => number,
  ) => {
    const attribute = geometry.getAttribute('aOpacity');
    // Guard against running before the matching geometry has been built.
    if (!attribute || attribute.count !== pointData.length) return;

    const opacities = attribute.array as Float32Array;
    for (const [index, point] of pointData.entries()) {
      opacities[index] = opacityForPoint(point);
    }
    attribute.needsUpdate = true;
  };

  /** Flags points whose image is shown so the core shader drops their dot. */
  const setHiddenCores = (
    pointData: GraphPointData[],
    imageShownKeys: Set<string>,
  ) => {
    const attribute = geometry.getAttribute('aHideCore');
    // Guard against running before the matching geometry has been built.
    if (!attribute || attribute.count !== pointData.length) return;

    const flags = attribute.array as Float32Array;
    for (const [index, point] of pointData.entries()) {
      flags[index] = imageShownKeys.has(point.key) ? 1 : 0;
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
      setColors(pointData);
      setActiveState(pointData, props.activePredicate());
      setOpacity(pointData, props.opacityForPoint?.() ?? FULL_OPACITY);
      setHiddenCores(pointData, props.imageShownKeys());
    });
    props.requestRender();
  });

  // Active/dimmed state (filter / active weights).
  createEffect(() => {
    setActiveState(props.points(), props.activePredicate());
    props.requestRender();
  });

  // Extra opacity (alias-depth fade, etc.).
  createEffect(() => {
    setOpacity(props.points(), props.opacityForPoint?.() ?? FULL_OPACITY);
    props.requestRender();
  });

  // Core visibility: hide the data dot for samples whose image is drawn (the
  // glow keeps showing — only the core program reads aHideCore).
  createEffect(() => {
    setHiddenCores(props.points(), props.imageShownKeys());
    props.requestRender();
  });

  // Layout-level core visibility is one uniform update; per-point image
  // suppression remains independently encoded by aHideCore.
  createEffect(() => {
    coreMaterial.uniforms['uShowCore']!.value = props.showCore() ? 1 : 0;
    props.requestRender();
  });

  // Device pixel ratio (sprite size = CSS px × dpr) on both materials. The
  // glow-buffer scale is applied in-shader on the halo, so this is the only
  // pixel-ratio input.
  createEffect(() => {
    const pr = props.pixelRatio();
    coreMaterial.uniforms['uPixelRatio']!.value = pr;
    haloMaterial.uniforms['uPixelRatio']!.value = pr;
    props.requestRender();
  });

  onCleanup(() => {
    geometry.dispose();
    coreMaterial.dispose();
    haloMaterial.dispose();
  });

  return { core, halo };
}

/** Builds the active-state predicate from the current graph filter. */
export function makeActivePredicate(
  filteredKeys: Set<string>,
): (point: GraphPointData) => boolean {
  return (point) => filteredKeys.has(point.item.meta.safe_name);
}
