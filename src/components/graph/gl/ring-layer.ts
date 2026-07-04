import { type Accessor, createEffect, indexArray, onCleanup } from 'solid-js';
import {
  Color,
  Group,
  Mesh,
  NormalBlending,
  type Object3D,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import { ringFragmentShader, ringVertexShader } from './ring-shaders';

/** Stroke width (CSS px) of every ring, constant regardless of radius. A thin
 *  1px line anti-aliases into the bright glow behind it and loses its true
 *  color, so give it a solid core. */
const LINE_WIDTH_PX = 1;
/** Extra screen px the quad extends past the ring radius, so the stroke's outer
 *  half-width and its anti-aliased feather are never clipped by the quad edge. */
const AA_PAD_PX = 2;

/** Which highlight affordance a ring represents — it sets the radius. */
export type RingKind = 'selected' | 'alias-source' | 'hover' | 'family';

/** Radius (CSS px) per affordance; the stroke width stays constant regardless.
 *  Matches the original SVG circle radii. */
const RING_RADIUS_PX: Record<RingKind, number> = {
  'selected': 40,
  'alias-source': 30,
  'hover': 20,
  'family': 24,
};

/** One ring to draw: a circle centered at world (x, y), sized by its kind. */
export interface RingSpec {
  x: number;
  y: number;
  color: number;
  kind: RingKind;
  /** 1 = full; < 1 dims the stroke for filtered-out / inactive-weight fonts. */
  opacity: number;
}

export interface RingLayerProps {
  /** The rings to show; one mesh is kept alive per array slot. */
  specs: Accessor<RingSpec[]>;
  /** World-units-per-CSS-pixel factor so radii stay constant on zoom. */
  zoom: Accessor<number>;
  /** Schedules a repaint of the (on-demand) render loop. */
  requestRender: () => void;
}

/**
 * The selection / hover / family highlight rings.
 *
 * Each ring is a single quad carrying a signed-distance ring stroke (see
 * {@link ringFragmentShader}), scaled so the stroke sits at its pixel radius. The
 * SDF keeps the stroke a constant pixel width at any zoom, and — unlike a `Line2`
 * polyline, which double-blends at its segment joints — has no self-overlap, so a
 * dimmed (filtered-out / inactive-weight) ring veils evenly with no brighter
 * seams. It is kept out of the bloom pass so it renders crisp rather than glowing.
 *
 * The ring set is owned reactively: {@link indexArray} keeps one mesh per slot of
 * `props.specs`, updating it in place when its spec changes and disposing its
 * material (three.js does not free GPU resources automatically) when the slot goes
 * away. The unit quad geometry is shared by all rings and freed on teardown.
 */
export function createRingLayer(props: RingLayerProps): Object3D {
  // Shared unit quad ([-1, 1] in local space); each ring scales it so local 1.0
  // maps to (its radius + padding) screen px.
  const quadGeometry = new PlaneGeometry(2, 2);

  const group = new Group();
  group.renderOrder = 1;

  const meshes = indexArray(
    () => props.specs(),
    (spec) => {
      const material = new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color() },
          uOpacity: { value: 1 },
          uHalfPx: { value: 1 },
          uRadiusPx: { value: 1 },
          uHalfWidthPx: { value: LINE_WIDTH_PX / 2 },
        },
        vertexShader: ringVertexShader,
        fragmentShader: ringFragmentShader,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        // Explicit normal blend: the ring is a solid stroke, never additive, so
        // its color stays the pure cluster color and isn't tinted by the glow.
        blending: NormalBlending,
      });
      const mesh = new Mesh(quadGeometry, material);
      mesh.frustumCulled = false;
      group.add(mesh);

      // Appearance / position follow the spec at this slot.
      createEffect(() => {
        (material.uniforms['uColor']!.value as Color).set(spec().color);
        material.uniforms['uOpacity']!.value = spec().opacity;
        mesh.position.set(spec().x, spec().y, 1);
      });
      // The kind's pixel radius is held constant on zoom by scaling the quad; the
      // shader reads the same radius/half-extent in screen px to place the stroke.
      createEffect(() => {
        const radiusPx = RING_RADIUS_PX[spec().kind];
        const halfPx = radiusPx + LINE_WIDTH_PX / 2 + AA_PAD_PX;
        material.uniforms['uRadiusPx']!.value = radiusPx;
        material.uniforms['uHalfPx']!.value = halfPx;
        const size = halfPx * props.zoom();
        mesh.scale.set(size, size, 1);
      });

      onCleanup(() => {
        group.remove(mesh);
        material.dispose();
      });

      return mesh;
    },
  );

  // Realize the mapping and repaint whenever the rings or shared inputs change.
  createEffect(() => {
    meshes();
    props.zoom();
    props.requestRender();
  });

  onCleanup(() => quadGeometry.dispose());

  return group;
}
