import { Group, NormalBlending, type Object3D, Vector2 } from 'three';
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

/**
 * The selection / hover / family highlight rings.
 *
 * Each ring is a {@link Line2} sharing one unit-circle geometry, scaled to its
 * pixel radius. Because `Line2` measures `linewidth` in screen pixels, the
 * stroke stays a constant width no matter how large the circle is — and it is
 * kept out of the bloom pass so it renders crisp rather than glowing.
 *
 * The handful of rings is small enough that `setRings` simply rebuilds them:
 * it disposes the previous lines' materials (three.js does not free GPU
 * resources automatically) and creates fresh ones. The unit-circle geometry is
 * shared across all rings and only disposed on teardown.
 */
export interface RingLayer {
  /** The three.js object to add to the (un-bloomed) overlay scene. */
  readonly object: Object3D;
  /** Replaces the shown rings with exactly these (rebuilds from scratch). */
  setRings(specs: RingSpec[]): void;
  /** Updates the world-units-per-CSS-pixel factor so radii stay constant on zoom. */
  setZoom(zoom: number): void;
  /** Feeds the viewport resolution `LineMaterial` needs for pixel widths. */
  setResolution(width: number, height: number): void;
  /** Releases GPU resources. */
  dispose(): void;
}

interface RingEntry {
  line: Line2;
  radiusPx: number;
}

/** Creates the {@link RingLayer}. Starts empty until `setRings` is called. */
export function createRingLayer(): RingLayer {
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

  // The rings currently in the scene; rebuilt by every `setRings`.
  let entries: RingEntry[] = [];
  // Viewport resolution LineMaterial needs for pixel widths; remembered so new
  // rings adopt the latest value.
  const resolution = new Vector2(1, 1);
  let zoom = 1;

  /** Sizes a ring's stroke to its pixel radius at the current zoom. */
  const scaleEntry = ({ line, radiusPx }: RingEntry) => {
    const size = radiusPx * zoom;
    line.scale.set(size, size, 1);
  };

  /** Removes the current rings and frees their per-ring GPU material. */
  const clear = () => {
    for (const { line } of entries) {
      group.remove(line);
      line.material.dispose();
    }
    entries = [];
  };

  return {
    object: group,

    setRings(specs) {
      clear();
      entries = specs.map((spec) => {
        const material = new LineMaterial({
          color: spec.color,
          linewidth: LINE_WIDTH_PX,
          transparent: true,
          opacity: spec.opacity,
          depthTest: false,
          // Explicit normal blend: the ring is a solid stroke, never additive, so
          // its color stays the pure cluster color and isn't tinted by the glow.
          blending: NormalBlending,
        });
        material.resolution.copy(resolution);
        const line = new Line2(circleGeometry, material);
        line.frustumCulled = false;
        line.position.set(spec.x, spec.y, 1);
        const entry: RingEntry = { line, radiusPx: spec.radiusPx };
        scaleEntry(entry);
        group.add(line);
        return entry;
      });
    },

    setZoom(nextZoom) {
      zoom = nextZoom;
      for (const entry of entries) scaleEntry(entry);
    },

    setResolution(width, height) {
      resolution.set(width, height);
      for (const { line } of entries) line.material.resolution.copy(resolution);
    },

    dispose() {
      clear();
      circleGeometry.dispose();
    },
  };
}
