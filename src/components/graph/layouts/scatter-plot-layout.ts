import { extent, range } from 'd3-array';
import { forceCollide, forceSimulation, forceX, forceY } from 'd3-force';
import { scaleSymlog } from 'd3-scale';
import { randomLcg } from 'd3-random';
import { type FontItemRecord } from '@/types/font';
import { GRAPH_PADDING, GRAPH_SIZE } from '@/components/graph/constants';
import {
  type GraphCoordinate,
  type ScatterGridLine,
} from '@/components/graph/types';
import { type GraphLayoutBase } from './types';

export interface ScatterPlotLayout extends GraphLayoutBase<'scatter-plot'> {
  readonly gridLines: ScatterGridLine[];
  /** Projected (0σ, 0σ), which need not be the bounds' midpoint. */
  readonly origin: GraphCoordinate;
}

/** Soft scale at which the standardised scatter axes become logarithmic. */
const SYMLOG_CONSTANT = 1.25;
/** Graph-space spacing, independent of camera zoom and detail visibility. */
const MIN_COLLISION_RADIUS = 6;
const MAX_COLLISION_RADIUS = 12;

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

/** Symlog projection of the first two PCs, relaxed to separate crowded points. */
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
  // Vary collision radii to avoid uniform close packing. Seeded D3 randomness
  // and sorted keys keep assignments repeatable for the loaded font set, even
  // after reordering input. These radii are visual spacing, not font metrics.
  const random = randomLcg(0.42);
  const radiusByKey = new Map(
    located
      .map(({ key }) => key)
      .sort()
      .map((key) => [
        key,
        MIN_COLLISION_RADIUS +
          random() * (MAX_COLLISION_RADIUS - MIN_COLLISION_RADIUS),
      ]),
  );
  // D3 mutates only these layout-owned nodes, never the source PCA coordinates.
  // Anchors preserve the map's neighbourhoods; cooling leaves collision forces
  // to resolve the remaining crowding. No timer or camera-dependent simulation.
  const nodes = located.map(({ key, x, y }) => {
    const targetX = projectionX.project(x);
    const targetY = GRAPH_SIZE - projectionY.project(y);
    return {
      key,
      x: targetX,
      y: targetY,
      targetX,
      targetY,
      radius: radiusByKey.get(key)!,
    };
  });
  const simulation = forceSimulation(nodes)
    .stop()
    .alphaDecay(0.06)
    .force(
      'x',
      forceX<(typeof nodes)[number]>((node) => node.targetX).strength(0.1),
    )
    .force(
      'y',
      forceY<(typeof nodes)[number]>((node) => node.targetY).strength(0.1),
    )
    .force(
      'collide',
      forceCollide<(typeof nodes)[number]>((node) => node.radius).iterations(2),
    );
  simulation.tick(120);
  // Finish without the anchors pulling already separated neighbours together.
  simulation.force('x', null).force('y', null).tick(20);

  const positionByKey = new Map<string, GraphCoordinate>(
    nodes.map(({ key, x, y }) => [key, { x, y }]),
  );

  return {
    mode: 'scatter-plot',
    width: GRAPH_SIZE,
    height: GRAPH_SIZE,
    origin: {
      x: projectionX.project(0),
      y: GRAPH_SIZE - projectionY.project(0),
    },
    positionByKey,
    // Gridlines remain a reference for the original PCA projection; relaxed
    // point positions no longer encode exact sigma values.
    gridLines: [
      ...sigmaGridLines('x', projectionX),
      ...sigmaGridLines('y', projectionY),
    ],
  };
}
