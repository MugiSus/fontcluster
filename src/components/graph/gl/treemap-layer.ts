import { type Accessor, createEffect, onCleanup } from 'solid-js';
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  NormalBlending,
  type Object3D,
  ShaderMaterial,
  Vector2,
} from 'three';
import { type LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { TREEMAP_BOUNDARY_WIDTH_PX } from '@/components/graph/constants';
import { type RectangularTreemapLayout } from '@/components/graph/layouts/rectangular-treemap-layout';
import {
  type GraphPolygon,
  type VoronoiTreemapLayout,
} from '@/components/graph/layouts/voronoi-treemap-layout';
import {
  getBackgroundColor,
  getClusterColor,
  getScatterGridColor,
  type GraphOutputColorSpace,
} from './cluster-colors-gl';
import { createFatLineMaterial } from './fat-line-material';
import {
  polygonStrokeFragmentShader,
  polygonStrokeVertexShader,
} from './shaders/polygon-stroke';

type TreemapLayout = RectangularTreemapLayout | VoronoiTreemapLayout;

interface TreemapLayerProps {
  layout: Accessor<TreemapLayout | null>;
  isDark: Accessor<boolean>;
  colorSpace: GraphOutputColorSpace;
  resolution: Accessor<{ width: number; height: number }>;
  requestRender: () => void;
}

const POLYGON_STROKE_AA_WIDTH_PX = 1;
const DUPLICATE_POINT_EPSILON_SQUARED = 1e-12;

/** Tessellates exact one-sided polygon bands with a one-pixel inner AA fringe. */
function createOneSidedPolygonGeometry(
  strokes: readonly {
    polygon: GraphPolygon;
    color: Color;
    offsetDirection: 1 | -1;
  }[],
): BufferGeometry {
  const positions: number[] = [];
  const previousPositions: number[] = [];
  const nextPositions: number[] = [];
  const colors: number[] = [];
  const offsetDirections: number[] = [];
  const offsetDistances: number[] = [];
  const coverages: number[] = [];
  const indexes: number[] = [];
  const ringDistances = [
    0,
    Math.max(TREEMAP_BOUNDARY_WIDTH_PX - POLYGON_STROKE_AA_WIDTH_PX / 2, 0),
    TREEMAP_BOUNDARY_WIDTH_PX + POLYGON_STROKE_AA_WIDTH_PX / 2,
  ];
  const ringCoverages = [1, 1, 0];

  for (const stroke of strokes) {
    const points: [number, number][] = [];
    for (const [x, y] of stroke.polygon) {
      const point: [number, number] = [x, -y];
      const lastPoint = points.at(-1);
      if (lastPoint) {
        const dx = point[0] - lastPoint[0];
        const dy = point[1] - lastPoint[1];
        if (dx * dx + dy * dy <= DUPLICATE_POINT_EPSILON_SQUARED) continue;
      }
      points.push(point);
    }
    const firstPoint = points[0];
    const lastPoint = points.at(-1);
    if (firstPoint && lastPoint && points.length > 1) {
      const dx = firstPoint[0] - lastPoint[0];
      const dy = firstPoint[1] - lastPoint[1];
      if (dx * dx + dy * dy <= DUPLICATE_POINT_EPSILON_SQUARED) points.pop();
    }
    if (points.length < 3) continue;

    let signedDoubleArea = 0;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index]!;
      const nextPoint = points[(index + 1) % points.length]!;
      signedDoubleArea += point[0] * nextPoint[1] - nextPoint[0] * point[1];
    }
    if (signedDoubleArea < 0) points.reverse();
    if (signedDoubleArea === 0) continue;

    const firstVertexIndex = positions.length / 3;
    for (let index = 0; index < points.length; index += 1) {
      const previous = points[(index + points.length - 1) % points.length]!;
      const current = points[index]!;
      const next = points[(index + 1) % points.length]!;
      for (
        let ringIndex = 0;
        ringIndex < ringDistances.length;
        ringIndex += 1
      ) {
        positions.push(current[0], current[1], 0);
        previousPositions.push(previous[0], previous[1], 0);
        nextPositions.push(next[0], next[1], 0);
        colors.push(stroke.color.r, stroke.color.g, stroke.color.b);
        offsetDirections.push(stroke.offsetDirection);
        offsetDistances.push(ringDistances[ringIndex]!);
        coverages.push(ringCoverages[ringIndex]!);
      }
    }

    for (let index = 0; index < points.length; index += 1) {
      const nextIndex = (index + 1) % points.length;
      for (
        let ringIndex = 0;
        ringIndex < ringDistances.length - 1;
        ringIndex += 1
      ) {
        const currentOuter = firstVertexIndex + index * 3 + ringIndex;
        const nextOuter = firstVertexIndex + nextIndex * 3 + ringIndex;
        const currentInner = currentOuter + 1;
        const nextInner = nextOuter + 1;
        if (stroke.offsetDirection === 1) {
          indexes.push(
            currentOuter,
            nextOuter,
            nextInner,
            currentOuter,
            nextInner,
            currentInner,
          );
        } else {
          indexes.push(
            currentOuter,
            nextInner,
            nextOuter,
            currentOuter,
            currentInner,
            nextInner,
          );
        }
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setIndex(indexes);
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    'previous',
    new Float32BufferAttribute(previousPositions, 3),
  );
  geometry.setAttribute('next', new Float32BufferAttribute(nextPositions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute(
    'offsetDirection',
    new Float32BufferAttribute(offsetDirections, 1),
  );
  geometry.setAttribute(
    'offsetDistance',
    new Float32BufferAttribute(offsetDistances, 1),
  );
  geometry.setAttribute('coverage', new Float32BufferAttribute(coverages, 1));
  return geometry;
}

/** Shared hierarchy lines, paired cluster outlines and frame for both maps. */
export function createTreemapLayer(props: TreemapLayerProps): Object3D {
  const group = new Group();
  const hierarchyMaterial = createFatLineMaterial({
    color: 0xffffff,
    linewidth: TREEMAP_BOUNDARY_WIDTH_PX,
    opacity: 1,
    hasVertexColors: true,
    hasRoundCaps: false,
  });
  const polygonMaterial = new ShaderMaterial({
    uniforms: {
      resolution: { value: new Vector2(1, 1) },
    },
    vertexShader: polygonStrokeVertexShader,
    fragmentShader: polygonStrokeFragmentShader,
    vertexColors: true,
    transparent: true,
    depthTest: false,
    blending: NormalBlending,
  });
  let hierarchyLines: LineSegments2 | null = null;
  let clusterStroke: Mesh | null = null;
  let frameStroke: Mesh | null = null;

  createEffect(() => {
    const layout = props.layout();
    const isDark = props.isDark();
    if (hierarchyLines) {
      group.remove(hierarchyLines);
      hierarchyLines.geometry.dispose();
    }
    for (const stroke of [clusterStroke, frameStroke]) {
      if (!stroke) continue;
      group.remove(stroke);
      stroke.geometry.dispose();
    }
    hierarchyLines = null;
    clusterStroke = null;
    frameStroke = null;
    if (!layout || layout.leafCells.length === 0) {
      props.requestRender();
      return;
    }

    const boundaries = layout.boundaries.filter(
      (boundary) => boundary.colorAngle !== undefined,
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
      const lastMergeIndex = boundaries.reduce(
        (last, boundary) => Math.max(last, boundary.mergeIndex),
        1,
      );
      const colors = boundaries.flatMap(({ colorAngle, mergeIndex }) => {
        const boundaryColor = getClusterColor({
          angle: colorAngle,
          colorSpace: props.colorSpace,
        });
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
        ? layout.clusterRects.map(({ x0, y0, x1, y1, colorAngle }) => ({
            polygon: [
              [x0, y0],
              [x1, y0],
              [x1, y1],
              [x0, y1],
            ] as GraphPolygon,
            colorAngle,
          }))
        : layout.clusterPolygons;
    if (clusterPolygons.length > 0) {
      clusterStroke = new Mesh(
        createOneSidedPolygonGeometry(
          clusterPolygons.map((cluster) => ({
            polygon: cluster.polygon,
            color: getClusterColor({
              angle: cluster.colorAngle,
              colorSpace: props.colorSpace,
            }),
            offsetDirection: 1,
          })),
        ),
        polygonMaterial,
      );
      clusterStroke.frustumCulled = false;
      clusterStroke.renderOrder = -0.54;
      group.add(clusterStroke);
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
    const frameColor = new Color(getScatterGridColor({ isDark }));
    frameStroke = new Mesh(
      createOneSidedPolygonGeometry([
        {
          polygon: framePolygon,
          color: frameColor,
          offsetDirection: -1,
        },
      ]),
      polygonMaterial,
    );
    frameStroke.frustumCulled = false;
    frameStroke.renderOrder = -0.53;
    group.add(frameStroke);
    props.requestRender();
  });

  createEffect(() => {
    const { width, height } = props.resolution();
    if (width > 0 && height > 0) {
      hierarchyMaterial.uniforms['resolution']!.value.set(width, height);
      polygonMaterial.uniforms['resolution']!.value.set(width, height);
    }
    props.requestRender();
  });

  onCleanup(() => {
    hierarchyLines?.geometry.dispose();
    clusterStroke?.geometry.dispose();
    frameStroke?.geometry.dispose();
    hierarchyMaterial.dispose();
    polygonMaterial.dispose();
  });

  return group;
}
