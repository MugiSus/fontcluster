import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  NormalBlending,
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
const CORE = 4;
/** Peak opacity at the glow center (it fades out from here). */
const GLOW_OPACITY = 0.5;

/**
 * The point cloud: every graph node as one vertex in a single draw call.
 *
 * Two per-vertex attributes drive appearance:
 * - `aColor` — the cluster color (rebuilt with the point set / theme).
 * - `aState` — 0 for active points, 1 for dimmed (filtered-out / inactive
 *   weight) points.
 *
 * The blend mode flips with the theme: additive glow on dark backgrounds,
 * normal-blended colored halos on light ones — see {@link PointLayer.setLightMode}.
 */
export interface PointLayer {
  /** The three.js object to add to the (bloomed) scene. */
  readonly object: Points;
  /**
   * Rebuilds the position buffer for a new point set and allocates the color /
   * state buffers (filled by {@link PointLayer.setColors} /
   * {@link PointLayer.setActiveState}). Resets color and state to zero, so
   * callers must re-apply both after calling this.
   */
  setPoints(points: GraphPointData[]): void;
  /** Updates the per-point color in place; call on theme change. */
  setColors(points: GraphPointData[], isDark: boolean): void;
  /** Updates only the active/dimmed flag per point (cheap, no realloc). */
  setActiveState(
    points: GraphPointData[],
    isActive: (point: GraphPointData) => boolean,
  ): void;
  /** Switches between additive (dark) and normal-blend (light) rendering. */
  setLightMode(isLight: boolean): void;
  /** Keeps the sprite size constant in CSS pixels across device pixel ratios. */
  setPixelRatio(pixelRatio: number): void;
  /** Releases GPU resources. */
  dispose(): void;
}

/** Creates the {@link PointLayer}. The buffers stay empty until `setPoints`. */
export function createPointLayer(): PointLayer {
  const geometry = new BufferGeometry();
  const material = new ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: 1 },
      uSize: { value: SIZE },
      uCore: { value: CORE },
      uOpacity: { value: GLOW_OPACITY },
    },
    vertexShader: pointVertexShader,
    fragmentShader: pointFragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 0;

  return {
    object: points,

    setPoints(pointData) {
      const count = pointData.length;
      const positions = new Float32Array(count * 3);
      for (let index = 0; index < count; index += 1) {
        const point = pointData[index]!;
        positions[index * 3] = point.x;
        // Graph space is y-down; negate so the world is y-up for the camera.
        positions[index * 3 + 1] = -point.y;
        positions[index * 3 + 2] = 0;
      }

      geometry.setAttribute(
        'position',
        new Float32BufferAttribute(positions, 3),
      );
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
    },

    setColors(pointData, isDark) {
      const attribute = geometry.getAttribute('aColor');
      // Guard against running before the matching geometry has been built.
      if (!attribute || attribute.count !== pointData.length) return;

      const colors = attribute.array as Float32Array;
      for (let index = 0; index < pointData.length; index += 1) {
        const hex = getClusterColor({
          k: pointData[index]!.item.computed?.clustering?.k,
          isDark,
        });
        colors[index * 3] = ((hex >> 16) & 0xff) / 255;
        colors[index * 3 + 1] = ((hex >> 8) & 0xff) / 255;
        colors[index * 3 + 2] = (hex & 0xff) / 255;
      }
      attribute.needsUpdate = true;
    },

    setActiveState(pointData, isActive) {
      const attribute = geometry.getAttribute('aState');
      // Guard against running before the matching geometry has been built.
      if (!attribute || attribute.count !== pointData.length) return;

      const states = attribute.array as Float32Array;
      for (let index = 0; index < pointData.length; index += 1) {
        states[index] = isActive(pointData[index]!) ? 0 : 1;
      }
      attribute.needsUpdate = true;
    },

    setLightMode(isLight) {
      // Dark: additive glow. Light: normal blend so the colored halo composites
      // transparently over the white background (no opaque disc).
      material.blending = isLight ? NormalBlending : AdditiveBlending;
      material.needsUpdate = true;
    },

    setPixelRatio(pixelRatio) {
      material.uniforms['uPixelRatio']!.value = pixelRatio;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
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
