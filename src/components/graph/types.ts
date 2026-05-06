import { type FontItem } from '../../types/font';

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

export interface PartitionedVisiblePoints {
  visibleFilteredPoints: GraphPointData[];
  visibleUnfilteredPoints: GraphPointData[];
  visibleActivePoints: GraphPointData[];
}

export interface GraphPointSearchTree {
  find: (x: number, y: number, radius?: number) => GraphPointData | undefined;
}
