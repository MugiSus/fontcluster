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

export interface GraphPointData {
  key: string;
  item: FontItem;
  x: number;
  y: number;
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
 * their leaf's dendrogram spoke; horizontal labels hang centred below their
 * scatter point.
 */
export type GraphPointLabel =
  | (GraphPointLabelBase & {
      orientation: 'radial';
      /** Polar angle of the leaf on the ring (graph space, y-down). */
      angle: number;
    })
  | (GraphPointLabelBase & { orientation: 'horizontal' });
