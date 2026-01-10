/**
 * Result of a text measurement operation.
 */
export interface TextMetrics {
  /** The precise "ink" width of the text (actualBoundingBoxLeft + actualBoundingBoxRight). */
  readonly width: number;
  /** The precise "ink" height of the text (actualBoundingBoxAscent + actualBoundingBoxDescent). */
  readonly height: number;
  /** The standard typographic advance width. */
  readonly advanceWidth: number;
  /** Distance from the baseline to the top-most ink. */
  readonly ascent: number;
  /** Distance from the baseline to the bottom-most ink. */
  readonly descent: number;
  /** Distance from the horizontal origin to the left-most ink. */
  readonly left: number;
  /** Distance from the horizontal origin to the right-most ink. */
  readonly right: number;
}

/**
 * A modern, smart utility to measure text dimensions using the HTML5 Canvas API.
 * Uses lazy initialization and supports font readiness checks.
 */
export class TextMeasurer {
  #ctx?: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  /**
   * Lazily initializes and returns the 2D rendering context.
   */
  get #context(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
    if (this.#ctx) return this.#ctx;

    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(0, 0)
        : document.createElement('canvas');

    const ctx = canvas.getContext('2d');
    if (!ctx)
      throw new Error('Failed to initialize 2D context for text measurement');

    this.#ctx = ctx as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D;
    return this.#ctx;
  }

  /**
   * Ensures the specified font is loaded and ready for measurement.
   */
  async prepare(fontSize: number, fontFamily = '"Noto Sans"'): Promise<void> {
    if (typeof document !== 'undefined' && 'fonts' in document) {
      await document.fonts.load(`${fontSize}px ${fontFamily}`);
    }
  }

  /**
   * Measures the dimensions of the given text.
   *
   * @param text The text to measure.
   * @param fontSize The font size in pixels.
   * @param fontFamily The font family (defaults to Noto Sans).
   * @returns Detailed metrics of the rendered text.
   */
  measure(
    text: string,
    fontSize: number,
    fontFamily = '"Noto Sans", sans-serif',
  ): TextMetrics {
    const ctx = this.#context;
    ctx.font = `${fontSize}px ${fontFamily}`;

    const m = ctx.measureText(text);

    return {
      width: m.actualBoundingBoxLeft + m.actualBoundingBoxRight,
      height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent,
      advanceWidth: m.width,
      ascent: m.actualBoundingBoxAscent,
      descent: m.actualBoundingBoxDescent,
      left: m.actualBoundingBoxLeft,
      right: m.actualBoundingBoxRight,
    };
  }
}

/**
 * Singleton instance for easy project-wide access.
 */
export const textMeasurer = new TextMeasurer();
