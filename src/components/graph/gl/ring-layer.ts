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
const RING_OPACITY = 1;

/** One ring to draw: a circle of `radiusPx` (CSS px) centered at world (x, y). */
export interface RingSpec {
  x: number;
  y: number;
  color: number;
  radiusPx: number;
}

/**
 * The selection / hover / family highlight rings.
 *
 * Each ring is a {@link Line2} sharing one unit-circle geometry, scaled to its
 * pixel radius. Because `Line2` measures `linewidth` in screen pixels, the
 * stroke stays a constant width no matter how large the circle is — and it is
 * kept out of the bloom pass so it renders crisp rather than glowing.
 *
 * Lines are pooled: `setRings` reuses existing objects and hides the surplus
 * instead of allocating on every selection change.
 */
export interface RingLayer {
  /** The three.js object to add to the (un-bloomed) overlay scene. */
  readonly object: Object3D;
  /** Shows exactly these rings, reusing pooled line objects. */
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
  material: LineMaterial;
  radiusPx: number;
}

/** Creates the {@link RingLayer}. Starts empty until `setRings` is called. */
export function createRingLayer(): RingLayer {
  // Shared unit circle (radius 1); each ring scales it to its pixel radius.
  const circleGeometry = new LineGeometry();
  const positions: number[] = [];
  for (let segment = 0; segment <= SEGMENTS; segment += 1) {
    const angle = (segment / SEGMENTS) * Math.PI * 2;
    positions.push(Math.cos(angle), Math.sin(angle), 0);
  }
  circleGeometry.setPositions(positions);

  const group = new Group();
  group.renderOrder = 1;

  const pool: RingEntry[] = [];
  let activeCount = 0;
  let zoom = 1;
  let resolutionWidth = 1;
  let resolutionHeight = 1;

  /** Lazily grows the pool, creating a new pooled ring at `index`. */
  const ensureEntry = (index: number): RingEntry => {
    const existing = pool[index];
    if (existing) return existing;
    const material = new LineMaterial({
      color: 0xffffff,
      linewidth: LINE_WIDTH_PX,
      transparent: true,
      opacity: RING_OPACITY,
      depthTest: false,
      // Explicit normal blend: the ring is a solid stroke, never additive, so
      // its color stays the pure cluster color and isn't tinted by the glow.
      blending: NormalBlending,
    });
    material.resolution.set(resolutionWidth, resolutionHeight);
    const line = new Line2(circleGeometry, material);
    line.frustumCulled = false;
    line.visible = false;
    group.add(line);
    const entry: RingEntry = { line, material, radiusPx: 0 };
    pool[index] = entry;
    return entry;
  };

  return {
    object: group,

    setRings(specs) {
      for (let index = 0; index < specs.length; index += 1) {
        const spec = specs[index]!;
        const entry = ensureEntry(index);
        entry.material.color.set(spec.color);
        entry.radiusPx = spec.radiusPx;
        entry.line.position.set(spec.x, spec.y, 1);
        entry.line.scale.set(spec.radiusPx * zoom, spec.radiusPx * zoom, 1);
        entry.line.visible = true;
      }
      for (let index = specs.length; index < pool.length; index += 1) {
        pool[index]!.line.visible = false;
      }
      activeCount = specs.length;
    },

    setZoom(nextZoom) {
      zoom = nextZoom;
      for (let index = 0; index < activeCount; index += 1) {
        const entry = pool[index]!;
        entry.line.scale.set(entry.radiusPx * zoom, entry.radiusPx * zoom, 1);
      }
    },

    setResolution(width, height) {
      resolutionWidth = width;
      resolutionHeight = height;
      for (const entry of pool) entry.material.resolution.set(width, height);
    },

    dispose() {
      for (const entry of pool) entry.material.dispose();
      circleGeometry.dispose();
    },
  };
}
