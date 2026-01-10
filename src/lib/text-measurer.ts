export interface TextDimensions {
  /** The "advance width" including side bearings. */
  width: number;
  /** The total height from the top-most ink to the bottom-most ink. */
  height: number;
  /** The actual "ink width" from the left-most pixel to the right-most pixel. */
  inkWidth: number;
  /** Distance from the baseline to the top-most ink. */
  ascent: number;
  /** Distance from the baseline to the bottom-most ink. */
  descent: number;
  /** Distance from the horizontal origin to the left-most ink. */
  left: number;
  /** Distance from the horizontal origin to the right-most ink. */
  right: number;
}

/**
 * A utility class to measure text dimensions using the HTML5 Canvas API.
 * This is particularly useful for measuring text rendered with "Noto Sans".
 */
export class TextMeasurer {
  private canvas: HTMLCanvasElement | OffscreenCanvas;
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  constructor() {
    // Use OffscreenCanvas if available, otherwise fallback to regular canvas
    if (typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(0, 0);
    } else {
      this.canvas = document.createElement('canvas');
    }

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2D context for text measurement');
    }
    this.ctx = ctx as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D;
  }

  /**
   * Measures the dimensions of the given text with the specified font size.
   * Uses "Noto Sans" as the primary font with a fallback to sans-serif.
   *
   * @param text The text to measure.
   * @param fontSize The font size in pixels.
   * @returns An object containing detailed metrics of the text.
   */
  measure(text: string, fontSize: number): TextDimensions {
    this.ctx.font = `${fontSize}px "Noto Sans", sans-serif`;
    const metrics = this.ctx.measureText(text);

    // actualBoundingBox metrics give the actual "ink" boundaries
    const ascent = metrics.actualBoundingBoxAscent;
    const descent = metrics.actualBoundingBoxDescent;
    const left = metrics.actualBoundingBoxLeft;
    const right = metrics.actualBoundingBoxRight;

    return {
      width: metrics.width, // Advance width
      height: ascent + descent,
      inkWidth: left + right, // Total horizontal span of pixels
      ascent,
      descent,
      left,
      right,
    };
  }
}

// Export a singleton instance for convenience
export const textMeasurer = new TextMeasurer();
