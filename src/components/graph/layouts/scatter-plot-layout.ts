import { extent, range } from 'd3-array';
import { scaleSymlog } from 'd3-scale';
import { type FontItemRecord } from '@/types/font';
import { GRAPH_PADDING, GRAPH_SIZE } from '@/components/graph/constants';
import {
  type GraphCoordinate,
  type ScatterGridLine,
} from '@/components/graph/types';
import { type GraphLayoutBase } from './types';

export interface ScatterPlotLayout extends GraphLayoutBase<'scatter-plot'> {
  readonly gridLines: ScatterGridLine[];
}

/** Soft scale at which the standardised scatter axes become logarithmic. */
const SYMLOG_CONSTANT = 1.25;

interface AxisProjection {
  project: (value: number) => number;
  gridDomain: [number, number] | null;
}

function createAxisProjection(values: number[]): AxisProjection {
  const [min, max] = extent(values);
  if (min == null || max == null || min === max) {
    return { project: () => GRAPH_SIZE / 2, gridDomain: null };
  }

  const scale = scaleSymlog<number, number>()
    .domain([min, max])
    .range([0, GRAPH_SIZE])
    .constant(SYMLOG_CONSTANT);
  return {
    project: (value) => scale(value),
    gridDomain: [
      scale.invert(-GRAPH_PADDING),
      scale.invert(GRAPH_SIZE + GRAPH_PADDING),
    ],
  };
}

function sigmaGridLines(
  axis: ScatterGridLine['axis'],
  projection: AxisProjection,
): ScatterGridLine[] {
  if (!projection.gridDomain) return [];
  const [min, max] = projection.gridDomain;
  return range(Math.ceil(min), Math.floor(max) + 1).map((sigma) => ({
    axis,
    sigma,
    position:
      axis === 'x'
        ? projection.project(sigma)
        : GRAPH_SIZE - projection.project(sigma),
  }));
}

/** Symlog projection of the clustering feature space's first two PCs. */
export function createScatterPlotLayout(
  displayData: FontItemRecord,
): ScatterPlotLayout {
  const located = Object.values(displayData).flatMap((item) => {
    const coordinate = item.computed?.clustering?.two;
    return coordinate
      ? [{ key: item.meta.safe_name, x: coordinate[0], y: coordinate[1] }]
      : [];
  });
  const projectionX = createAxisProjection(located.map(({ x }) => x));
  const projectionY = createAxisProjection(located.map(({ y }) => y));
  const positionByKey = new Map<string, GraphCoordinate>(
    located.map(({ key, x, y }) => [
      key,
      {
        x: projectionX.project(x),
        y: GRAPH_SIZE - projectionY.project(y),
      },
    ]),
  );

  return {
    mode: 'scatter-plot',
    width: GRAPH_SIZE,
    height: GRAPH_SIZE,
    positionByKey,
    gridLines: [
      ...sigmaGridLines('x', projectionX),
      ...sigmaGridLines('y', projectionY),
    ],
  };
}
