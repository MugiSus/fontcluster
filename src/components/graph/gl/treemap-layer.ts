import { type Accessor, createEffect, onCleanup } from 'solid-js';
import { Color, Group, type Object3D } from 'three';
import { type LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import {
  TREEMAP_BOUNDARY_WIDTH_PX,
  TREEMAP_CLUSTER_BOUNDARY_WIDTH_MULTIPLIER,
} from '@/components/graph/constants';
import { type RectangularTreemapLayout } from '@/components/graph/layouts/rectangular-treemap-layout';
import {
  type GraphPolygon,
  type VoronoiTreemapLayout,
} from '@/components/graph/layouts/voronoi-treemap-layout';
import {
  getBackgroundColor,
  getClusterColor,
  getScatterGridColor,
} from './cluster-colors-gl';
import { createFatLineMaterial } from './fat-line-material';

type TreemapLayout = RectangularTreemapLayout | VoronoiTreemapLayout;

interface TreemapLayerProps {
  layout: Accessor<TreemapLayout | null>;
  isDark: Accessor<boolean>;
  resolution: Accessor<{ width: number; height: number }>;
  requestRender: () => void;
}

function appendClosedPolygon(positions: number[], polygon: GraphPolygon): void {
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]!;
    const end = polygon[(index + 1) % polygon.length]!;
    positions.push(start[0], -start[1], 0, end[0], -end[1], 0);
  }
}

/** Shared hierarchy lines, paired cluster outlines and frame for both maps. */
export function createTreemapLayer(props: TreemapLayerProps): Object3D {
  const group = new Group();
  const hierarchyMaterial = createFatLineMaterial({
    color: 0xffffff,
    linewidth: TREEMAP_BOUNDARY_WIDTH_PX,
    opacity: 1,
    hasVertexColors: true,
  });
  const clusterMaterial = createFatLineMaterial({
    color: 0xffffff,
    linewidth:
      TREEMAP_BOUNDARY_WIDTH_PX * TREEMAP_CLUSTER_BOUNDARY_WIDTH_MULTIPLIER,
    opacity: 1,
    hasVertexColors: true,
  });
  const frameMaterial = createFatLineMaterial({
    color: 0xffffff,
    linewidth: TREEMAP_BOUNDARY_WIDTH_PX,
    opacity: 1,
    hasVertexColors: true,
  });
  let hierarchyLines: LineSegments2 | null = null;
  let clusterLines: LineSegments2 | null = null;
  let frameLines: LineSegments2 | null = null;

  createEffect(() => {
    const layout = props.layout();
    const isDark = props.isDark();
    for (const lines of [hierarchyLines, clusterLines, frameLines]) {
      if (!lines) continue;
      group.remove(lines);
      lines.geometry.dispose();
    }
    hierarchyLines = null;
    clusterLines = null;
    frameLines = null;
    if (!layout || layout.leafCells.length === 0) {
      props.requestRender();
      return;
    }

    const boundaries = layout.boundaries.filter(
      (boundary) => boundary.colorIndex !== undefined,
    );
    if (boundaries.length > 0) {
      const positions = boundaries.flatMap(({ x1, y1, x2, y2 }) => [
        x1,
        -y1,
        0,
        x2,
        -y2,
        0,
      ]);
      const background = new Color(getBackgroundColor({ isDark }));
      const boundaryColor = new Color();
      const lastMergeIndex = boundaries.reduce(
        (last, boundary) => Math.max(last, boundary.mergeIndex),
        1,
      );
      const colors = boundaries.flatMap(({ colorIndex, mergeIndex }) => {
        boundaryColor.set(getClusterColor({ colorIndex, isDark }));
        boundaryColor.lerpColors(
          background,
          boundaryColor,
          0.35 + 0.45 * (mergeIndex / lastMergeIndex),
        );
        return [
          boundaryColor.r,
          boundaryColor.g,
          boundaryColor.b,
          boundaryColor.r,
          boundaryColor.g,
          boundaryColor.b,
        ];
      });
      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(positions);
      geometry.setColors(colors);
      hierarchyLines = new LineSegments2(
        geometry,
        hierarchyMaterial as unknown as LineMaterial,
      );
      hierarchyLines.frustumCulled = false;
      hierarchyLines.renderOrder = -0.55;
      group.add(hierarchyLines);
    }

    const clusterPolygons =
      layout.mode === 'rectangular-treemap'
        ? layout.clusterRects.map(({ x0, y0, x1, y1, colorIndex }) => ({
            polygon: [
              [x0, y0],
              [x1, y0],
              [x1, y1],
              [x0, y1],
            ] as GraphPolygon,
            colorIndex,
          }))
        : layout.clusterPolygons;
    if (clusterPolygons.length > 0) {
      // Graph Y is negated before rendering. Rectangles then wind clockwise
      // (their interior is the shader's positive/right side), while the D3
      // Voronoi polygons wind counter-clockwise. Shift each centerline by half
      // its width towards its own interior so adjacent colors meet but do not
      // cover one another.
      clusterMaterial.uniforms['lineoffset']!.value =
        ((layout.mode === 'rectangular-treemap' ? 1 : -1) *
          TREEMAP_BOUNDARY_WIDTH_PX *
          TREEMAP_CLUSTER_BOUNDARY_WIDTH_MULTIPLIER) /
        2;
      const positions: number[] = [];
      const colors: number[] = [];
      const clusterColor = new Color();
      for (const cluster of clusterPolygons) {
        appendClosedPolygon(positions, cluster.polygon);
        clusterColor.set(
          getClusterColor({ colorIndex: cluster.colorIndex, isDark }),
        );
        for (let edge = 0; edge < cluster.polygon.length; edge += 1) {
          colors.push(
            clusterColor.r,
            clusterColor.g,
            clusterColor.b,
            clusterColor.r,
            clusterColor.g,
            clusterColor.b,
          );
        }
      }
      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(positions);
      geometry.setColors(colors);
      clusterLines = new LineSegments2(
        geometry,
        clusterMaterial as unknown as LineMaterial,
      );
      clusterLines.frustumCulled = false;
      clusterLines.renderOrder = -0.54;
      group.add(clusterLines);
    }

    const framePolygon: GraphPolygon =
      layout.mode === 'rectangular-treemap'
        ? [
            [0, 0],
            [layout.width, 0],
            [layout.width, layout.height],
            [0, layout.height],
          ]
        : layout.framePolygon;
    const framePositions: number[] = [];
    appendClosedPolygon(framePositions, framePolygon);
    const frameColor = new Color(getScatterGridColor({ isDark }));
    const frameColors = Array.from({ length: framePolygon.length * 2 }, () => [
      frameColor.r,
      frameColor.g,
      frameColor.b,
    ]).flat();
    const frameGeometry = new LineSegmentsGeometry();
    frameGeometry.setPositions(framePositions);
    frameGeometry.setColors(frameColors);
    frameLines = new LineSegments2(
      frameGeometry,
      frameMaterial as unknown as LineMaterial,
    );
    frameLines.frustumCulled = false;
    frameLines.renderOrder = -0.53;
    group.add(frameLines);
    props.requestRender();
  });

  createEffect(() => {
    const { width, height } = props.resolution();
    if (width > 0 && height > 0) {
      for (const material of [
        hierarchyMaterial,
        clusterMaterial,
        frameMaterial,
      ]) {
        material.uniforms['resolution']!.value.set(width, height);
      }
    }
    props.requestRender();
  });

  onCleanup(() => {
    hierarchyLines?.geometry.dispose();
    clusterLines?.geometry.dispose();
    frameLines?.geometry.dispose();
    hierarchyMaterial.dispose();
    clusterMaterial.dispose();
    frameMaterial.dispose();
  });

  return group;
}
