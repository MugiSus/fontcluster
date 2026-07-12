import { type GraphMode } from '@/types/graph';
import { type GraphCoordinate } from '@/components/graph/types';

export interface GraphLayoutBase<M extends GraphMode> {
  readonly mode: M;
  readonly width: number;
  readonly height: number;
  readonly positionByKey: ReadonlyMap<string, GraphCoordinate>;
  readonly findLeafKeyAt?: (x: number, y: number) => string | null;
}
