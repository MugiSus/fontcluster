import { type FontItem } from '@/types/font';

export interface GraphViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphCoordinate {
  x: number;
  y: number;
}

export type GraphToolMode = 'select' | 'drag' | 'zoom';

export interface GraphVisibleBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface CopySelectedFontOptions {
  isFontName: boolean;
  showToast: boolean;
}

export type CopySelectedFont = (options: CopySelectedFontOptions) => void;

export interface GraphPointData {
  key: string;
  item: FontItem;
  x: number;
  y: number;
}

/**
 * One σ gridline of the scatter layout, spanning the full graph extent
 * perpendicular to its axis.
 */
export interface ScatterGridLine {
  /** `'x'`: vertical line at graph-x `position`; `'y'`: horizontal line at
   *  graph-y `position`. */
  axis: 'x' | 'y';
  /** Graph-space coordinate of the line along its axis. */
  position: number;
  /** Standardised value (σ) the line marks; `0` is the collection mean. */
  sigma: number;
}

interface GraphPointLabelBase {
  /** Graph-point key (sample safe name) of the labelled font. */
  key: string;
  /** The font name drawn as the label. */
  text: string;
  /** Graph-space position of the labelled point. */
  x: number;
  y: number;
  /** Palette slot of the labelled font; undefined when it lacks clustering. */
  colorIndex: number | undefined;
}

/**
 * One font-name label of the GL label layer. Radial labels read outward along
 * their leaf's dendrogram spoke; rightward labels extend from a horizontal
 * tree's leaves; horizontal labels hang below points; centered labels occupy
 * the hidden core's original position in treemap modes without samples.
 */
export type GraphPointLabel =
  | (GraphPointLabelBase & {
      orientation: 'radial';
      /** Polar angle of the leaf on the ring (graph space, y-down). */
      angle: number;
    })
  | (GraphPointLabelBase & {
      orientation: 'rightward' | 'horizontal' | 'centered';
    });
