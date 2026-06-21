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
import { colorForCluster, type ClusterColorPalette } from './cluster-colors-gl';
import { pointFragmentShader, pointVertexShader } from './point-shaders';

/** Sprite diameter (CSS px) = the blur/glow extent. */
const SIZE = 64;
/** Solid core (data dot) diameter (CSS px), independent of the blur radius. */
const CORE = 4;

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
  /** Rebuilds position/color/state buffers for a new point set. */
  setPoints(points: GraphPointData[], palette: ClusterColorPalette): void;
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

    setPoints(pointData, palette) {
      const count = pointData.length;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const states = new Float32Array(count);

      for (let index = 0; index < count; index += 1) {
        const point = pointData[index]!;
        positions[index * 3] = point.x;
        // Graph space is y-down; negate so the world is y-up for the camera.
        positions[index * 3 + 1] = -point.y;
        positions[index * 3 + 2] = 0;
        const [r, g, b] = colorForCluster(
          palette,
          point.item.computed?.clustering?.k,
        );
        colors[index * 3] = r;
        colors[index * 3 + 1] = g;
        colors[index * 3 + 2] = b;
      }

      geometry.setAttribute(
        'position',
        new Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute('aColor', new Float32BufferAttribute(colors, 3));
      geometry.setAttribute('aState', new Float32BufferAttribute(states, 1));
      geometry.setDrawRange(0, count);
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
