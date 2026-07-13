import { createMemo, createRoot } from 'solid-js';
import { CubicBezierCurve, Vector2 } from 'three';
import { arcPoints, polarPoint } from './layouts/radial-tree-layout';
import { dendrogramTreeLayout } from './layouts/active-graph-layout';
import { getGraphPointByKey } from './font-point-index';
import {
  type GraphCoordinate,
  type GraphPointData,
  type GraphPointLabel,
} from './types';

/** One straight branch segment of a dendrogram, in graph space (y-down). */
export interface DendrogramEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mergeIndex: number;
  colorIndex: number | undefined;
}

interface DendrogramBezier {
  child: GraphCoordinate;
  parent: GraphCoordinate;
  mergeIndex: number;
  colorIndex: number | undefined;
}

/** One circular arc of the radial tree, in graph-space polar coordinates. */
export interface DendrogramArc {
  angleFrom: number;
  angleTo: number;
  radius: number;
  mergeIndex: number;
  colorIndex: number | undefined;
}

interface PositionedDendrogramNode {
  center: GraphCoordinate | null;
  angle: number;
  radius: number;
  parent: number;
  representativeKey: string | null;
  colorIndex: number | undefined;
  mergeIndex: number | null;
  height: number;
}

/** One merge-node alias, carrying the representative font's graph data. */
export interface DendrogramNodeDot extends GraphPointData {
  key: string;
  nodeIndex: number;
  safeName: string;
  colorIndex: number | undefined;
  mergeIndex: number;
}

export type DendrogramImageAnchor = DendrogramNodeDot;

interface DendrogramTree {
  mode: 'radial-tree' | 'horizontal-tree';
  edges: DendrogramEdge[];
  curves: DendrogramBezier[];
  arcs: DendrogramArc[];
  nodes: PositionedDendrogramNode[];
  leafIndexByKey: ReadonlyMap<string, number>;
  imageAnchors: DendrogramImageAnchor[];
  dots: DendrogramNodeDot[];
  labels: GraphPointLabel[];
}

const NO_ANCESTRY: GraphCoordinate[] = [];
const NO_EDGES: DendrogramEdge[] = [];
const NO_ARCS: DendrogramArc[] = [];
const NO_ANCHORS: DendrogramImageAnchor[] = [];
const NO_DOTS: DendrogramNodeDot[] = [];
const NO_LABELS: GraphPointLabel[] = [];
const COINCIDENT_EPSILON = 1e-6;
/** Pixel-error target used to adapt Cartesian curve tessellation to zoom. */
const HORIZONTAL_CURVE_ERROR_PX = 0.25;
const MIN_HORIZONTAL_CURVE_SEGMENTS = 8;
const MAX_HORIZONTAL_CURVE_SEGMENTS = 256;
const EQUAL_HEIGHT_CURVE_HANDLE_PX = 12;
const HORIZONTAL_CURVE_HANDLE_RATIO = 0.6;

function isCoincident(a: GraphCoordinate, b: GraphCoordinate): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < COINCIDENT_EPSILON;
}

/** Cubic link whose tangent is horizontal at both its child and parent. */
function horizontalTreeCurvePoints(
  child: GraphCoordinate,
  parent: GraphCoordinate,
  worldUnitsPerCssPixel: number,
): GraphCoordinate[] {
  const deltaX = parent.x - child.x;
  const deltaY = parent.y - child.y;
  // Both cubic handles share one x, keeping the link a single clean S-curve.
  // Sliding that x off the midpoint toward the parent (ratio > 0.5) shortens
  // the parent-side tangent and tightens the bend near the root while the leaf
  // side runs longer and flatter. Equal linkage heights place both nodes on one
  // x coordinate; give that degenerate case a small screen-fixed leftward handle
  // so the endpoint derivative stays horizontal instead of collapsing to zero.
  const handleX =
    Math.abs(deltaX) > COINCIDENT_EPSILON
      ? child.x + deltaX * HORIZONTAL_CURVE_HANDLE_RATIO
      : child.x -
        Math.min(
          Math.abs(deltaY) / 2,
          EQUAL_HEIGHT_CURVE_HANDLE_PX * worldUnitsPerCssPixel,
        );
  const screenSpan =
    Math.hypot(deltaX, deltaY) /
    Math.max(worldUnitsPerCssPixel, Number.EPSILON);
  const segmentCount = Math.max(
    MIN_HORIZONTAL_CURVE_SEGMENTS,
    Math.min(
      MAX_HORIZONTAL_CURVE_SEGMENTS,
      Math.ceil(Math.sqrt(screenSpan / HORIZONTAL_CURVE_ERROR_PX)),
    ),
  );
  return new CubicBezierCurve(
    new Vector2(child.x, child.y),
    new Vector2(handleX, child.y),
    new Vector2(handleX, parent.y),
    new Vector2(parent.x, parent.y),
  )
    .getPoints(segmentCount)
    .map(({ x, y }) => ({ x, y }));
}

const dendrogramTree = createRoot(() => {
  const memo = createMemo<DendrogramTree | null>(() => {
    const layout = dendrogramTreeLayout();
    if (!layout) return null;
    const { topology } = layout;

    const nodes: PositionedDendrogramNode[] = topology.nodes.map(
      (node, nodeIndex) => ({
        center: layout.nodeCenters[nodeIndex] ?? null,
        angle:
          layout.mode === 'radial-tree'
            ? (layout.nodeAngles[nodeIndex] ?? Number.NaN)
            : Number.NaN,
        radius:
          layout.mode === 'radial-tree'
            ? (layout.nodeRadii[nodeIndex] ?? 0)
            : 0,
        parent: node?.parentIndex ?? -1,
        representativeKey: node?.representativeKey ?? null,
        colorIndex: node?.colorIndex,
        mergeIndex: node?.mergeIndex ?? null,
        height: node?.height ?? 0,
      }),
    );

    const labels: GraphPointLabel[] = [];
    for (const leafIndex of topology.visibleLeafIndexes) {
      const node = topology.nodes[leafIndex];
      const positioned = nodes[leafIndex];
      if (!node?.key || !positioned?.center) continue;
      const point = getGraphPointByKey(node.key);
      if (!point) continue;
      labels.push(
        layout.mode === 'radial-tree'
          ? {
              key: node.key,
              text: point.item.meta.font_name,
              x: positioned.center.x,
              y: positioned.center.y,
              orientation: 'radial',
              angle: positioned.angle,
              colorIndex: node.colorIndex,
            }
          : {
              key: node.key,
              text: point.item.meta.font_name,
              x: positioned.center.x,
              y: positioned.center.y,
              orientation: 'rightward',
              colorIndex: node.colorIndex,
            },
      );
    }

    const edges: DendrogramEdge[] = [];
    const curves: DendrogramBezier[] = [];
    const arcs: DendrogramArc[] = [];
    const pushSegment = (
      from: GraphCoordinate,
      to: GraphCoordinate,
      mergeIndex: number,
      colorIndex: number | undefined,
    ) => {
      if (isCoincident(from, to)) return;
      edges.push({
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        mergeIndex,
        colorIndex,
      });
    };

    for (
      let nodeIndex = topology.leafCount;
      nodeIndex < topology.nodes.length;
      nodeIndex += 1
    ) {
      const node = topology.nodes[nodeIndex];
      const parent = nodes[nodeIndex];
      if (!node || !parent?.center || node.mergeIndex === null) continue;
      const children = node.children.flatMap((childIndex) => {
        const child = nodes[childIndex];
        return child?.center ? [child] : [];
      });

      if (layout.mode === 'radial-tree') {
        if (children.length === 2) {
          const [left, right] = children;
          const leftElbow = polarPoint(left!.angle, parent.radius);
          const rightElbow = polarPoint(right!.angle, parent.radius);
          pushSegment(
            left!.center!,
            leftElbow,
            node.mergeIndex,
            node.colorIndex,
          );
          pushSegment(
            right!.center!,
            rightElbow,
            node.mergeIndex,
            node.colorIndex,
          );
          if (
            parent.radius > COINCIDENT_EPSILON &&
            Math.abs(right!.angle - left!.angle) > COINCIDENT_EPSILON
          ) {
            arcs.push({
              angleFrom: left!.angle,
              angleTo: right!.angle,
              radius: parent.radius,
              mergeIndex: node.mergeIndex,
              colorIndex: node.colorIndex,
            });
          }
        } else if (children.length === 1) {
          pushSegment(
            children[0]!.center!,
            parent.center,
            node.mergeIndex,
            node.colorIndex,
          );
        }
      } else {
        for (const child of children) {
          curves.push({
            child: child.center!,
            parent: parent.center,
            mergeIndex: node.mergeIndex,
            colorIndex: node.colorIndex,
          });
        }
      }
    }

    const imageAnchors: DendrogramImageAnchor[] = [];
    const dots: DendrogramNodeDot[] = [];
    for (
      let nodeIndex = topology.leafCount;
      nodeIndex < nodes.length;
      nodeIndex += 1
    ) {
      const node = nodes[nodeIndex];
      if (
        !node?.center ||
        node.mergeIndex === null ||
        node.height <= COINCIDENT_EPSILON ||
        !node.representativeKey
      ) {
        continue;
      }
      const representativePoint = getGraphPointByKey(node.representativeKey);
      if (!representativePoint) continue;
      const alias: DendrogramNodeDot = {
        key: `dendrogram:${nodeIndex}`,
        nodeIndex,
        safeName: node.representativeKey,
        item: representativePoint.item,
        x: node.center.x,
        y: node.center.y,
        colorIndex:
          representativePoint.item.computed?.clustering?.color_index ??
          node.colorIndex,
        mergeIndex: node.mergeIndex,
      };
      dots.push(alias);
      imageAnchors.push(alias);
    }

    return {
      mode: layout.mode,
      edges,
      curves,
      arcs,
      nodes,
      leafIndexByKey: topology.leafIndexByKey,
      imageAnchors,
      dots,
      labels,
    };
  });
  return memo;
});

export const dendrogramEdges = (
  worldUnitsPerCssPixel = 1,
): DendrogramEdge[] => {
  const tree = dendrogramTree();
  if (!tree) return NO_EDGES;
  if (tree.mode === 'radial-tree') return tree.edges;

  return tree.curves.flatMap((curve) => {
    const points = horizontalTreeCurvePoints(
      curve.child,
      curve.parent,
      worldUnitsPerCssPixel,
    );
    return points.slice(1).flatMap((point, index) => {
      const previous = points[index]!;
      return isCoincident(previous, point)
        ? []
        : [
            {
              x1: previous.x,
              y1: previous.y,
              x2: point.x,
              y2: point.y,
              mergeIndex: curve.mergeIndex,
              colorIndex: curve.colorIndex,
            },
          ];
    });
  });
};

export const dendrogramArcs = (): DendrogramArc[] =>
  dendrogramTree()?.arcs ?? NO_ARCS;

export const dendrogramImageAnchors = (): DendrogramImageAnchor[] =>
  dendrogramTree()?.imageAnchors ?? NO_ANCHORS;

export const dendrogramNodeDots = (): DendrogramNodeDot[] =>
  dendrogramTree()?.dots ?? NO_DOTS;

export const dendrogramLeafLabels = (): GraphPointLabel[] =>
  dendrogramTree()?.labels ?? NO_LABELS;

/** Polyline from a leaf through every absorbing merge to the root. */
export function getDendrogramAncestry(
  key: string | null,
  worldUnitsPerCssPixel = 1,
): GraphCoordinate[] {
  const tree = dendrogramTree();
  if (!tree || !key) return NO_ANCESTRY;
  const leafIndex = tree.leafIndexByKey.get(key);
  const leaf = leafIndex === undefined ? undefined : tree.nodes[leafIndex];
  if (!leaf?.center) return NO_ANCESTRY;

  const points: GraphCoordinate[] = [leaf.center];
  const pushPoint = (point: GraphCoordinate) => {
    const last = points[points.length - 1];
    if (!last || !isCoincident(last, point)) points.push(point);
  };

  let node = leaf;
  if (tree.mode === 'horizontal-tree') {
    while (node.parent !== -1) {
      const parent = tree.nodes[node.parent];
      if (!parent?.center || !node.center) break;
      const curve = horizontalTreeCurvePoints(
        node.center,
        parent.center,
        worldUnitsPerCssPixel,
      );
      for (let index = 1; index < curve.length; index += 1) {
        pushPoint(curve[index]!);
      }
      node = parent;
    }
    return points;
  }

  let angle = leaf.angle;
  while (node.parent !== -1) {
    const parent = tree.nodes[node.parent];
    if (!parent?.center) break;
    pushPoint(polarPoint(angle, parent.radius));
    for (const point of arcPoints(angle, parent.angle, parent.radius)) {
      pushPoint(point);
    }
    angle = parent.angle;
    node = parent;
  }
  return points;
}
