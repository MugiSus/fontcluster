declare module 'd3-voronoi-treemap' {
  import { type HierarchyNode } from 'd3-hierarchy';

  export type VoronoiPoint = [number, number];
  export type VoronoiPolygon = VoronoiPoint[];

  export type VoronoiHierarchyNode<T> = HierarchyNode<T> & {
    polygon?: VoronoiPolygon;
  };

  export interface VoronoiTreemapLayout<T> {
    (root: VoronoiHierarchyNode<T>): void;
    clip(): VoronoiPolygon;
    clip(polygon: VoronoiPolygon): this;
    convergenceRatio(): number;
    convergenceRatio(ratio: number): this;
    maxIterationCount(): number;
    maxIterationCount(count: number): this;
    minWeightRatio(): number;
    minWeightRatio(ratio: number): this;
    prng(): () => number;
    prng(generator: () => number): this;
  }

  export function voronoiTreemap<T>(): VoronoiTreemapLayout<T>;
}
