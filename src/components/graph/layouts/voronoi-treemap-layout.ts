import { hierarchy } from 'd3-hierarchy';
import { polygonCentroid, polygonContains } from 'd3-polygon';
import { randomLcg } from 'd3-random';
import {
  voronoiTreemap,
  type VoronoiHierarchyNode,
  type VoronoiPoint,
} from 'd3-voronoi-treemap';
import { GRAPH_SIZE } from '@/components/graph/constants';
import {
  type DendrogramHierarchyDatum,
  type DendrogramTopology,
} from '@/components/graph/dendrogram-topology';
import { type GraphCoordinate } from '@/components/graph/types';
import { type GraphLayoutBase } from './types';

export type GraphPolygon = readonly VoronoiPoint[];

export interface VoronoiTreemapLeafCell {
  readonly key: string;
  readonly polygon: GraphPolygon;
  readonly colorIndex: number | undefined;
}

export interface VoronoiTreemapBoundary {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly mergeIndex: number;
  readonly colorIndex: number;
}

export interface VoronoiTreemapClusterPolygon {
  readonly polygon: GraphPolygon;
  readonly colorIndex: number;
}

export interface VoronoiTreemapLayout
  extends GraphLayoutBase<'voronoi-treemap'> {
  readonly leafCells: readonly VoronoiTreemapLeafCell[];
  readonly boundaries: readonly VoronoiTreemapBoundary[];
  readonly clusterPolygons: readonly VoronoiTreemapClusterPolygon[];
  readonly framePolygon: GraphPolygon;
}

const CIRCLE_POINT_COUNT = 128;
const CONVERGENCE_RATIO = 0.005;
const MAX_ITERATION_COUNT = 100;
const RANDOM_SEED = 0.417_021;
const SHARED_POINT_EPSILON = 1e-7;

function sharedPolygonSegment(
  first: GraphPolygon,
  second: GraphPolygon,
): [VoronoiPoint, VoronoiPoint] | null {
  const epsilonSquared = SHARED_POINT_EPSILON * SHARED_POINT_EPSILON;
  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    const firstStart = first[firstIndex]!;
    const firstEnd = first[(firstIndex + 1) % first.length]!;
    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      const secondStart = second[secondIndex]!;
      const secondEnd = second[(secondIndex + 1) % second.length]!;
      const startDx = firstStart[0] - secondEnd[0];
      const startDy = firstStart[1] - secondEnd[1];
      const endDx = firstEnd[0] - secondStart[0];
      const endDy = firstEnd[1] - secondStart[1];
      if (
        startDx * startDx + startDy * startDy <= epsilonSquared &&
        endDx * endDx + endDy * endDy <= epsilonSquared
      ) {
        return [
          [
            (firstStart[0] + secondEnd[0]) / 2,
            (firstStart[1] + secondEnd[1]) / 2,
          ],
          [
            (firstEnd[0] + secondStart[0]) / 2,
            (firstEnd[1] + secondStart[1]) / 2,
          ],
        ];
      }
    }
  }
  return null;
}

/** Hierarchical representative-win-weighted partition clipped to a circle. */
export function createVoronoiTreemapLayout(
  topology: DendrogramTopology,
): VoronoiTreemapLayout {
  const center = GRAPH_SIZE / 2;
  const framePolygon: VoronoiPoint[] = Array.from(
    { length: CIRCLE_POINT_COUNT },
    (_, index) => {
      const angle = (Math.PI * 2 * index) / CIRCLE_POINT_COUNT;
      return [
        center + center * Math.cos(angle),
        center + center * Math.sin(angle),
      ];
    },
  );
  const root = hierarchy(topology.rootData, (datum) => datum.children).sum(
    (datum) => {
      if (datum.nodeIndex < 0 || !topology.nodes[datum.nodeIndex]?.key)
        return 0;
      return (
        (topology.representativeWinCountByLeafIndex[datum.nodeIndex] ?? 0) + 1
      );
    },
  ) as VoronoiHierarchyNode<DendrogramHierarchyDatum>;

  voronoiTreemap<DendrogramHierarchyDatum>()
    .clip(framePolygon)
    .prng(randomLcg(RANDOM_SEED))
    .minWeightRatio(1 / root.value!)
    .convergenceRatio(CONVERGENCE_RATIO)
    .maxIterationCount(MAX_ITERATION_COUNT)(root);

  const positionByKey = new Map<string, GraphCoordinate>();
  const leafCells: VoronoiTreemapLeafCell[] = [];
  for (const leaf of root.leaves() as VoronoiHierarchyNode<DendrogramHierarchyDatum>[]) {
    const node = topology.nodes[leaf.data.nodeIndex];
    const polygon = leaf.polygon;
    if (!node?.key || !polygon || polygon.length < 3) continue;
    const [x, y] = polygonCentroid(polygon);
    positionByKey.set(node.key, { x, y });
    leafCells.push({
      key: node.key,
      polygon,
      colorIndex: node.colorIndex,
    });
  }

  const boundaries: VoronoiTreemapBoundary[] = [];
  const clusterPolygons: VoronoiTreemapClusterPolygon[] = [];
  root.eachBefore((hierarchyNode) => {
    const voronoiNode =
      hierarchyNode as VoronoiHierarchyNode<DendrogramHierarchyDatum>;
    const node = topology.nodes[voronoiNode.data.nodeIndex];
    const parentNode = voronoiNode.parent
      ? topology.nodes[voronoiNode.parent.data.nodeIndex]
      : null;
    if (
      node?.clusterId !== undefined &&
      node.colorIndex !== undefined &&
      parentNode?.clusterId !== node.clusterId &&
      voronoiNode.polygon
    ) {
      clusterPolygons.push({
        polygon: voronoiNode.polygon,
        colorIndex: node.colorIndex,
      });
    }

    const children = voronoiNode.children as
      | VoronoiHierarchyNode<DendrogramHierarchyDatum>[]
      | undefined;
    if (
      !node ||
      node.mergeIndex === null ||
      node.colorIndex === undefined ||
      children?.length !== 2 ||
      !children[0]!.polygon ||
      !children[1]!.polygon
    ) {
      return;
    }
    const segment = sharedPolygonSegment(
      children[0]!.polygon!,
      children[1]!.polygon!,
    );
    if (!segment) return;
    boundaries.push({
      x1: segment[0][0],
      y1: segment[0][1],
      x2: segment[1][0],
      y2: segment[1][1],
      mergeIndex: node.mergeIndex,
      colorIndex: node.colorIndex,
    });
  });

  return {
    mode: 'voronoi-treemap',
    width: GRAPH_SIZE,
    height: GRAPH_SIZE,
    positionByKey,
    leafCells,
    boundaries,
    clusterPolygons,
    framePolygon,
    findLeafKeyAt: (x, y) => {
      if (!polygonContains(framePolygon, [x, y])) return null;
      let node: VoronoiHierarchyNode<DendrogramHierarchyDatum> | undefined =
        root;
      while (node.children) {
        node = (
          node.children as VoronoiHierarchyNode<DendrogramHierarchyDatum>[]
        ).find(
          (child) => child.polygon && polygonContains(child.polygon, [x, y]),
        );
        if (!node) return null;
      }
      return topology.nodes[node.data.nodeIndex]?.key ?? null;
    },
  };
}
