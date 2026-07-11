/**
 * Minimal ambient typings for `troika-three-text`, which ships no TypeScript
 * definitions. Only the surface the label layer uses is declared; see
 * https://protectwise.github.io/troika/troika-three-text/ for the full API.
 */
declare module 'troika-three-text' {
  import {
    type BufferGeometry,
    type Material,
    Mesh,
    type Object3DEventMap,
  } from 'three';

  interface TextEventMap extends Object3DEventMap {
    syncstart: object;
    synccomplete: object;
  }

  /** A single SDF text block; layout and SDF generation run in a worker. */
  export class Text extends Mesh<BufferGeometry, Material, TextEventMap> {
    /** The string to render. */
    text: string;
    /** URL of the font file to use (.ttf/.otf/.woff; no .woff2). */
    font: string | null;
    /** Glyph em-height in local (world) units. */
    fontSize: number;
    /** Horizontal anchor within the text block. */
    anchorX: number | 'left' | 'center' | 'right' | string;
    /** Vertical anchor within the text block. */
    anchorY:
      | number
      | 'top'
      | 'top-baseline'
      | 'middle'
      | 'bottom-baseline'
      | 'bottom'
      | string;
    /** Fill color; overrides the material color. */
    color: number | string | null;
    /** Fill opacity, on top of the material opacity. */
    fillOpacity: number;
    /** Latest worker-computed text layout; null before the first sync. */
    readonly textRenderInfo: {
      /** Whole text block as [minX, minY, maxX, maxY]. */
      readonly blockBounds: readonly [number, number, number, number];
    } | null;
    /**
     * Schedules the async re-layout after property changes; `callback` fires
     * when the result has been applied (also dispatched as `synccomplete`).
     */
    sync(callback?: () => void): void;
    /** Frees this instance's geometry (the derived material is shared). */
    dispose(): void;
  }

  /**
   * EXPERIMENTAL (upstream): renders any number of member `Text` instances in
   * a single draw call. Members are not scene children — only their local
   * position/rotation/scale and per-member visual properties apply; the
   * batch's own material renders them all.
   */
  export class BatchedText extends Text {
    /** Registers a member `Text` (also reached via `add()`). */
    addText(text: Text): void;
    /** Unregisters a member `Text` (does not dispose it). */
    removeText(text: Text): void;
  }
}
