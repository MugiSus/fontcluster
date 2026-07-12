import { GRAPH_SIZE } from '@/components/graph/constants';
import { type DendrogramTopology } from '@/components/graph/dendrogram-topology';
import { type GraphCoordinate } from '@/components/graph/types';
import { type GraphLayoutBase } from './types';

export interface RadialTreeLayout extends GraphLayoutBase<'radial-tree'> {
  readonly topology: DendrogramTopology;
  /** Position of every linkage node; null for nodes without a displayed leaf. */
  readonly nodeCenters: readonly (GraphCoordinate | null)[];
  /** Polar angle of every linkage node; NaN when the node is absent. */
  readonly nodeAngles: readonly number[];
  /** Polar radius of every linkage node. */
  readonly nodeRadii: readonly number[];
}

const CENTER = GRAPH_SIZE / 2;
const LEAF_RADIUS = GRAPH_SIZE / 2;
const START_ANGLE = -Math.PI / 2;
const MAX_ARC_CHORD = 3;

export function polarPoint(angle: number, radius: number): GraphCoordinate {
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle),
  };
}

/** Chord destinations for an arc: excludes the start and includes the end. */
export function arcPoints(
  angleFrom: number,
  angleTo: number,
  radius: number,
): GraphCoordinate[] {
  const span = angleTo - angleFrom;
  const steps = Math.max(
    1,
    Math.ceil((Math.abs(span) * radius) / MAX_ARC_CHORD),
  );
  return Array.from({ length: steps }, (_, step) =>
    polarPoint(angleFrom + (span * (step + 1)) / steps, radius),
  );
}

/** Classic circular dendrogram preserving the backend's left-first OLO. */
export function createRadialTreeLayout(
  topology: DendrogramTopology,
): RadialTreeLayout {
  const angles = new Array<number>(topology.nodes.length).fill(Number.NaN);
  const totalVisible = topology.visibleLeafIndexes.length;
  let slot = 0;

  for (const root of topology.roots) {
    const stack = [root];
    while (stack.length > 0) {
      const nodeIndex = stack.pop()!;
      const node = topology.nodes[nodeIndex];
      if (!node) continue;
      if (node.key !== null) {
        angles[nodeIndex] =
          START_ANGLE + (2 * Math.PI * (slot + 0.5)) / totalVisible;
        slot += 1;
        continue;
      }
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        stack.push(node.children[index]!);
      }
    }
  }

  for (
    let nodeIndex = topology.leafCount;
    nodeIndex < topology.nodes.length;
    nodeIndex += 1
  ) {
    const node = topology.nodes[nodeIndex];
    if (!node) continue;
    const childAngles = node.children
      .map((childIndex) => angles[childIndex]!)
      .filter((angle) => !Number.isNaN(angle));
    if (childAngles.length > 0) {
      angles[nodeIndex] =
        childAngles.reduce((sum, angle) => sum + angle, 0) / childAngles.length;
    }
  }

  const nodeRadii = topology.nodes.map((node) => {
    if (!node || node.key !== null) return LEAF_RADIUS;
    if (topology.maxHeight <= 0) return 0;
    return LEAF_RADIUS * (1 - node.height / topology.maxHeight);
  });
  const nodeCenters = angles.map((angle, nodeIndex) =>
    Number.isNaN(angle) ? null : polarPoint(angle, nodeRadii[nodeIndex]!),
  );
  const positionByKey = new Map<string, GraphCoordinate>();
  for (const leafIndex of topology.visibleLeafIndexes) {
    const node = topology.nodes[leafIndex];
    const center = nodeCenters[leafIndex];
    if (node?.key && center) positionByKey.set(node.key, center);
  }

  return {
    mode: 'radial-tree',
    width: GRAPH_SIZE,
    height: GRAPH_SIZE,
    topology,
    positionByKey,
    nodeCenters,
    nodeAngles: angles,
    nodeRadii,
  };
}
