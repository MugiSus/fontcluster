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
