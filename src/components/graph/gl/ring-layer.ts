import { type Accessor, createEffect, indexArray, onCleanup } from 'solid-js';
import { Group, NormalBlending, type Object3D } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

/** Stroke width (CSS px) of every ring, constant regardless of radius. A thin
 *  1px line anti-aliases into the (bright, additive) glow behind it and loses
 *  its true color, so give it a solid core. */
const LINE_WIDTH_PX = 1;
/** Number of segments approximating each circle. */
const SEGMENTS = 64;

/** One ring to draw: a circle of `radiusPx` (CSS px) centered at world (x, y). */
export interface RingSpec {
  x: number;
  y: number;
  color: number;
  radiusPx: number;
  /** 1 = full; < 1 dims the stroke for filtered-out / inactive-weight fonts. */
  opacity: number;
}

export interface RingLayerProps {
  /** The rings to show; one {@link Line2} is kept alive per array slot. */
  specs: Accessor<RingSpec[]>;
  /** World-units-per-CSS-pixel factor so radii stay constant on zoom. */
  zoom: Accessor<number>;
  /** Viewport resolution `LineMaterial` needs for its pixel-space width. */
  resolution: Accessor<{ width: number; height: number }>;
  /** Schedules a repaint of the (on-demand) render loop. */
  requestRender: () => void;
}

export interface RingLayer {
  /** The three.js object to add to the (un-bloomed) overlay scene. */
  readonly object: Object3D;
}

/**
 * The selection / hover / family highlight rings.
 *
 * Each ring is a {@link Line2} sharing one unit-circle geometry, scaled to its
 * pixel radius. Because `Line2` measures `linewidth` in screen pixels, the
 * stroke stays a constant width no matter how large the circle is — and it is
 * kept out of the bloom pass so it renders crisp rather than glowing.
 *
 * The ring set is owned reactively: {@link indexArray} keeps one line per slot
 * of `props.specs`, updating it in place when its spec changes and disposing it
 * (three.js does not free GPU resources automatically) when the slot goes away.
 * The unit-circle geometry is shared by all rings and freed on teardown.
 */
export function createRingLayer(props: RingLayerProps): RingLayer {
  // Shared unit circle (radius 1); each ring scales it to its pixel radius.
  const circleGeometry = new LineGeometry();
  circleGeometry.setPositions(
    Array.from({ length: SEGMENTS + 1 }, (_, segment) => {
      const angle = (segment / SEGMENTS) * Math.PI * 2;
      return [Math.cos(angle), Math.sin(angle), 0];
    }).flat(),
  );

  const group = new Group();
  group.renderOrder = 1;

  const lines = indexArray(
    () => props.specs(),
    (spec) => {
      const material = new LineMaterial({
        linewidth: LINE_WIDTH_PX,
        transparent: true,
        depthTest: false,
        // Explicit normal blend: the ring is a solid stroke, never additive, so
        // its color stays the pure cluster color and isn't tinted by the glow.
        blending: NormalBlending,
      });
      const line = new Line2(circleGeometry, material);
      line.frustumCulled = false;
      group.add(line);

      // Appearance / position follow the spec at this slot.
      createEffect(() => {
        material.color.set(spec().color);
        material.opacity = spec().opacity;
        line.position.set(spec().x, spec().y, 1);
      });
      // Pixel radius is held constant on zoom by scaling the unit circle.
      createEffect(() => {
        const size = spec().radiusPx * props.zoom();
        line.scale.set(size, size, 1);
      });
      // Pixel-space stroke width needs the live viewport resolution.
      createEffect(() => {
        const { width, height } = props.resolution();
        if (width > 0 && height > 0) material.resolution.set(width, height);
      });

      onCleanup(() => {
        group.remove(line);
        material.dispose();
      });

      return line;
    },
  );

  // Realize the mapping and repaint whenever the rings or shared inputs change.
  createEffect(() => {
    lines();
    props.zoom();
    props.resolution();
    props.requestRender();
  });

  onCleanup(() => circleGeometry.dispose());

  return { object: group };
}
