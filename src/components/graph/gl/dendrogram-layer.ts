import { type Accessor, createEffect, onCleanup } from 'solid-js';
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  type Object3D,
  Points,
  ShaderMaterial,
  Vector2,
} from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
// Type-only: `Line2` / `LineSegments2` type their material param as `LineMaterial`,
// but we drive them with our own `ShaderMaterial` (see `createFatLineMaterial`).
// The class is never imported as a value, so it stays out of the bundle.
import { type LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import {
  type DendrogramArc,
  type DendrogramEdge,
  type DendrogramNodeDot,
} from '@/components/graph/dendrogram-edges';
import { GRAPH_SIZE } from '@/components/graph/constants';
import { type GraphCoordinate } from '@/components/graph/types';
import { arcFragmentShader, arcVertexShader } from './arc-shaders';
import { getBackgroundColor, getClusterColor } from './cluster-colors-gl';
import { createFatLineMaterial } from './fat-line-material';
import { coreFragmentShader, coreVertexShader } from './point-shaders';

/** Stroke width in CSS px; fat lines keep a solid core. */
const EDGE_WIDTH_PX = 1;
/** Extra CSS px around each analytic arc's bounding quad for the AA feather. */
const ARC_AA_PAD_PX = 2;
/** Uniform opacity on top of the per-segment fade, so crossing segments blend
 *  instead of the later (coarser) one occluding the finer one. */
const EDGE_OPACITY = 1.0;
/** Per-segment fade: the finest merge draws at NEAR, the coarsest at FAR. The
 *  fade is baked into the vertex colors as a lerp towards the background, so
 *  the tree recedes with depth without needing per-vertex alpha. */
const FADE_NEAR = 0.9;
const FADE_FAR = 0.3;
/** Merge-node alias core opacity: finest merge at NEAR, root side at FAR. */
const ALIAS_CORE_OPACITY_NEAR = 1.0;
const ALIAS_CORE_OPACITY_FAR = 1.0;
/** Merge-node alias glow opacity multiplier: finest merge at NEAR, root side
 *  at FAR. The halo shader's own `uOpacity` is applied after this. */
const ALIAS_GLOW_OPACITY_NEAR = 1.0;
const ALIAS_GLOW_OPACITY_FAR = 0.5;
/** The ancestry highlight is the mode's focal line: slightly wider and near
 *  opaque so it stands out of the faded tree. */
const HIGHLIGHT_WIDTH_PX = 1.5;
const HIGHLIGHT_OPACITY = 1;
/** Merge-node dot diameter (CSS px); matches the point layer's core dots so
 *  branch points read like the leaf points. */
const NODE_DOT_PX = 3;
const DENDROGRAM_CENTER = GRAPH_SIZE / 2;
const TWO_PI = Math.PI * 2;
const ARC_BOUNDS_CARDINAL_ANGLES = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];

/** Depth fade of a merge edge's color towards the background. */
const fadeForRank = (
  mergeIndex: number,
  lastMergeIndex: number,
  near = FADE_NEAR,
  far = FADE_FAR,
) => near - (near - far) * (mergeIndex / lastMergeIndex);

export const dendrogramAliasCoreOpacityForRank = (
  mergeIndex: number,
  lastMergeIndex: number,
) =>
  fadeForRank(
    mergeIndex,
    lastMergeIndex,
    ALIAS_CORE_OPACITY_NEAR,
    ALIAS_CORE_OPACITY_FAR,
  );

export const dendrogramAliasGlowOpacityForRank = (
  mergeIndex: number,
  lastMergeIndex: number,
) =>
  fadeForRank(
    mergeIndex,
    lastMergeIndex,
    ALIAS_GLOW_OPACITY_NEAR,
    ALIAS_GLOW_OPACITY_FAR,
  );

/** The selected font's merge-ancestry polyline and its stroke color. */
export interface DendrogramHighlight {
  /** Graph-space (y-down) polyline: the point, then successive merge centroids. */
  points: GraphCoordinate[];
  color: number;
}

export interface DendrogramLayerProps {
  /** The straight spokes to draw, in graph space (y-down), ordered by merge rank. */
  edges: Accessor<DendrogramEdge[]>;
  /** The analytic arcs to draw, in graph-space polar coordinates. */
  arcs: Accessor<DendrogramArc[]>;
  /** The merge-node dots to draw, in merge order. */
  dots: Accessor<DendrogramNodeDot[]>;
  /** Node indexes whose exemplar image is drawn; their dot is hidden (the
   *  image replaces it, like the point layer's `aHideCore`). */
  imageNodeIndexes: Accessor<Set<number>>;
  /** The selected font's ancestry to emphasize, if any. */
  highlight: Accessor<DendrogramHighlight | null>;
  /** Representative font keys that are currently active/selectable. */
  activeKeys: Accessor<Set<string>>;
  /** Whether the active theme is dark (picks cluster/background colors). */
  isDark: Accessor<boolean>;
  /** Viewport resolution `LineMaterial` needs for its pixel-space width. */
  resolution: Accessor<{ width: number; height: number }>;
  /** World-units-per-CSS-pixel factor so arc stroke width stays constant. */
  zoom: Accessor<number>;
  /** Device pixel ratio; the node dot sprite sizes to it. */
  pixelRatio: Accessor<number>;
  /** Schedules a repaint of the (on-demand) render loop. */
  requestRender: () => void;
}

/**
 * The active dendrogram tree: radial brackets or Cartesian branches (see
 * `dendrogram-edges.ts`) plus a data dot at every merge node. Rendered under
 * the points (renderOrder -0.5) so the tree reads as a backplate.
 *
 * Two visual encodings are baked into per-segment vertex colors:
 * - merges whose subtree lies inside one final cluster take that cluster's
 *   color; merges spanning clusters fall back to the neutral gray that
 *   `getClusterColor` returns for "no cluster";
 * - color fades towards the background with merge rank, so fine structure is
 *   vivid and the coarse trunks recede.
 * The node dots themselves behave like graph-point aliases: they use the
 * representative point color and the point-core shader's active/dimmed alpha.
 *
 * `LineSegmentsGeometry` and the instanced arc geometry have no in-place resize,
 * so each edge/theme change swaps in freshly built geometry and disposes the old
 * one. The render loop owns the group's visibility across the glow passes.
 */
export function createDendrogramLayer(props: DendrogramLayerProps): Object3D {
  const material = createFatLineMaterial({
    color: 0xffffff,
    linewidth: EDGE_WIDTH_PX,
    opacity: EDGE_OPACITY,
    hasVertexColors: true,
  });
  const highlightMaterial = createFatLineMaterial({
    color: 0xffffff,
    linewidth: HIGHLIGHT_WIDTH_PX,
    opacity: HIGHLIGHT_OPACITY,
    hasVertexColors: false,
  });
  const arcMaterial = new ShaderMaterial({
    uniforms: {
      uCenter: { value: new Vector2(DENDROGRAM_CENTER, DENDROGRAM_CENTER) },
      uLineWidth: { value: EDGE_WIDTH_PX },
      uOpacity: { value: EDGE_OPACITY },
      uPad: { value: ARC_AA_PAD_PX },
      uZoom: { value: 1 },
    },
    vertexShader: arcVertexShader,
    fragmentShader: arcFragmentShader,
    transparent: true,
    depthTest: false,
    blending: NormalBlending,
  });

  // The merge-node dots reuse the point layer's core sprite program: aColor
  // carries the representative color, aOpacity carries the alias depth fade,
  // and aHideCore suppresses the dot where the node's exemplar image is drawn
  // — exactly the leaf points' image behaviour.
  const dotGeometry = new BufferGeometry();
  const dotMaterial = new ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: 1 },
      uCore: { value: NODE_DOT_PX },
      uShowCore: { value: 1 },
    },
    vertexShader: coreVertexShader,
    fragmentShader: coreFragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: NormalBlending,
  });

  const group = new Group();
  let lines: LineSegments2 | null = null;
  let arcMesh: Mesh<InstancedBufferGeometry, ShaderMaterial> | null = null;
  let highlightLine: Line2 | null = null;

  const dots = new Points(dotGeometry, dotMaterial);
  dots.frustumCulled = false;
  // Above the edges and the ancestry highlight, below the leaf points.
  dots.renderOrder = -0.3;
  group.add(dots);

  createEffect(() => {
    const edges = props.edges();
    const isDark = props.isDark();
    if (lines) {
      group.remove(lines);
      lines.geometry.dispose();
      lines = null;
    }
    if (edges.length > 0) {
      const lastMergeIndex = edges[edges.length - 1]!.mergeIndex || 1;
      const background = new Color(getBackgroundColor({ isDark }));
      const segmentColor = new Color();

      // World Y is the negated graph Y (graph space is y-down).
      const positions = edges.flatMap(({ x1, y1, x2, y2 }) => [
        x1,
        -y1,
        0,
        x2,
        -y2,
        0,
      ]);
      const colors = edges.flatMap(({ mergeIndex, colorIndex }) => {
        const fade = fadeForRank(mergeIndex, lastMergeIndex);
        segmentColor.set(getClusterColor({ colorIndex, isDark }));
        segmentColor.lerpColors(background, segmentColor, fade);
        const { r, g, b } = segmentColor;
        return [r, g, b, r, g, b];
      });

      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(positions);
      geometry.setColors(colors);
      lines = new LineSegments2(geometry, material as unknown as LineMaterial);
      lines.frustumCulled = false;
      lines.renderOrder = -0.5;
      group.add(lines);
    }
    props.requestRender();
  });

  createEffect(() => {
    const arcs = props.arcs();
    const straightEdges = props.edges();
    const isDark = props.isDark();
    if (arcMesh) {
      group.remove(arcMesh);
      arcMesh.geometry.dispose();
      arcMesh = null;
    }
    if (arcs.length > 0) {
      const lastMergeIndex = Math.max(
        straightEdges[straightEdges.length - 1]?.mergeIndex ??
          arcs[arcs.length - 1]!.mergeIndex,
        1,
      );
      const background = new Color(getBackgroundColor({ isDark }));
      const segmentColor = new Color();
      const boxCenters = new Float32Array(arcs.length * 2);
      const boxHalfSizes = new Float32Array(arcs.length * 2);
      const angles = new Float32Array(arcs.length * 2);
      const radii = new Float32Array(arcs.length);
      const colors = new Float32Array(arcs.length * 3);

      for (const [index, arc] of arcs.entries()) {
        const startX = DENDROGRAM_CENTER + arc.radius * Math.cos(arc.angleFrom);
        const startY = DENDROGRAM_CENTER + arc.radius * Math.sin(arc.angleFrom);
        const endX = DENDROGRAM_CENTER + arc.radius * Math.cos(arc.angleTo);
        const endY = DENDROGRAM_CENTER + arc.radius * Math.sin(arc.angleTo);
        let minX = Math.min(startX, endX);
        let maxX = Math.max(startX, endX);
        let minY = Math.min(startY, endY);
        let maxY = Math.max(startY, endY);

        for (const cardinal of ARC_BOUNDS_CARDINAL_ANGLES) {
          const angle = cardinal < arc.angleFrom ? cardinal + TWO_PI : cardinal;
          if (angle > arc.angleTo) continue;
          const x = DENDROGRAM_CENTER + arc.radius * Math.cos(angle);
          const y = DENDROGRAM_CENTER + arc.radius * Math.sin(angle);
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }

        boxCenters[index * 2] = (minX + maxX) / 2;
        boxCenters[index * 2 + 1] = (minY + maxY) / 2;
        boxHalfSizes[index * 2] = (maxX - minX) / 2;
        boxHalfSizes[index * 2 + 1] = (maxY - minY) / 2;
        angles[index * 2] = arc.angleFrom;
        angles[index * 2 + 1] = arc.angleTo;
        radii[index] = arc.radius;

        const fade = fadeForRank(arc.mergeIndex, lastMergeIndex);
        segmentColor.set(
          getClusterColor({ colorIndex: arc.colorIndex, isDark }),
        );
        segmentColor.lerpColors(background, segmentColor, fade);
        colors[index * 3] = segmentColor.r;
        colors[index * 3 + 1] = segmentColor.g;
        colors[index * 3 + 2] = segmentColor.b;
      }

      const geometry = new InstancedBufferGeometry();
      geometry.setIndex([0, 2, 1, 2, 3, 1]);
      geometry.setAttribute(
        'position',
        new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3),
      );
      geometry.setAttribute(
        'instanceBoxCenter',
        new InstancedBufferAttribute(boxCenters, 2),
      );
      geometry.setAttribute(
        'instanceBoxHalfSize',
        new InstancedBufferAttribute(boxHalfSizes, 2),
      );
      geometry.setAttribute(
        'instanceAngles',
        new InstancedBufferAttribute(angles, 2),
      );
      geometry.setAttribute(
        'instanceRadius',
        new InstancedBufferAttribute(radii, 1),
      );
      geometry.setAttribute(
        'instanceColor',
        new InstancedBufferAttribute(colors, 3),
      );
      geometry.instanceCount = arcs.length;
      arcMesh = new Mesh(geometry, arcMaterial);
      arcMesh.frustumCulled = false;
      arcMesh.renderOrder = -0.5;
      group.add(arcMesh);
    }
    props.requestRender();
  });

  // Node dot positions + colors (rebuilt with the dot set / theme, like the
  // edges above). aState and aHideCore are owned by the effects below.
  createEffect(() => {
    const nodeDots = props.dots();
    const isDark = props.isDark();
    const count = nodeDots.length;
    const lastMergeIndex = nodeDots[count - 1]?.mergeIndex || 1;
    const dotColor = new Color();

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const opacities = new Float32Array(count);
    for (const [index, dot] of nodeDots.entries()) {
      positions[index * 3] = dot.x;
      // World Y is the negated graph Y (graph space is y-down).
      positions[index * 3 + 1] = -dot.y;
      positions[index * 3 + 2] = 0;
      dotColor.set(getClusterColor({ colorIndex: dot.colorIndex, isDark }));
      colors[index * 3] = dotColor.r;
      colors[index * 3 + 1] = dotColor.g;
      colors[index * 3 + 2] = dotColor.b;
      opacities[index] = dendrogramAliasCoreOpacityForRank(
        dot.mergeIndex,
        lastMergeIndex,
      );
    }
    dotGeometry.setAttribute(
      'position',
      new Float32BufferAttribute(positions, 3),
    );
    dotGeometry.setAttribute('aColor', new Float32BufferAttribute(colors, 3));
    dotGeometry.setAttribute(
      'aState',
      new Float32BufferAttribute(new Float32Array(count), 1),
    );
    dotGeometry.setAttribute(
      'aOpacity',
      new Float32BufferAttribute(opacities, 1),
    );
    dotGeometry.setAttribute(
      'aHideCore',
      new Float32BufferAttribute(new Float32Array(count), 1),
    );
    dotGeometry.setDrawRange(0, count);
    props.requestRender();
  });

  // Match the point-core active/dimmed opacity and scale for merge-node aliases.
  createEffect(() => {
    const activeKeys = props.activeKeys();
    const nodeDots = props.dots();
    const attribute = dotGeometry.getAttribute('aState');
    if (!attribute || attribute.count !== nodeDots.length) return;

    const states = attribute.array as Float32Array;
    for (const [index, dot] of nodeDots.entries()) {
      states[index] = activeKeys.has(dot.safeName) ? 0 : 1;
    }
    attribute.needsUpdate = true;
    props.requestRender();
  });

  // Hide the dot where the node's exemplar image is drawn (cheap in-place
  // flag update; the geometry effect above reallocates it to all-shown).
  createEffect(() => {
    const shownImages = props.imageNodeIndexes();
    const nodeDots = props.dots();
    const attribute = dotGeometry.getAttribute('aHideCore');
    if (!attribute || attribute.count !== nodeDots.length) return;

    const flags = attribute.array as Float32Array;
    for (const [index, dot] of nodeDots.entries()) {
      flags[index] = shownImages.has(dot.nodeIndex) ? 1 : 0;
    }
    attribute.needsUpdate = true;
    props.requestRender();
  });

  // The selected font's ancestry, drawn as a continuous polyline over the
  // tree. `LineGeometry` has no in-place resize either, so it is rebuilt per
  // selection change (the path is only ever tree-depth long).
  createEffect(() => {
    const highlight = props.highlight();
    if (highlightLine) {
      group.remove(highlightLine);
      highlightLine.geometry.dispose();
      highlightLine = null;
    }
    if (highlight && highlight.points.length >= 2) {
      // World Y is the negated graph Y (graph space is y-down).
      const positions = highlight.points.flatMap(({ x, y }) => [x, -y, 0]);
      const geometry = new LineGeometry();
      geometry.setPositions(positions);
      highlightMaterial.uniforms['diffuse']!.value.set(highlight.color);
      highlightLine = new Line2(
        geometry,
        highlightMaterial as unknown as LineMaterial,
      );
      highlightLine.frustumCulled = false;
      highlightLine.renderOrder = -0.4;
      group.add(highlightLine);
    }
    props.requestRender();
  });

  createEffect(() => {
    const { width, height } = props.resolution();
    if (width > 0 && height > 0) {
      material.uniforms['resolution']!.value.set(width, height);
      highlightMaterial.uniforms['resolution']!.value.set(width, height);
    }
    props.requestRender();
  });

  createEffect(() => {
    arcMaterial.uniforms['uZoom']!.value = props.zoom();
    props.requestRender();
  });

  // Device pixel ratio (dot sprite size = CSS px × dpr), like the point layer.
  createEffect(() => {
    dotMaterial.uniforms['uPixelRatio']!.value = props.pixelRatio();
    props.requestRender();
  });

  onCleanup(() => {
    lines?.geometry.dispose();
    arcMesh?.geometry.dispose();
    highlightLine?.geometry.dispose();
    material.dispose();
    highlightMaterial.dispose();
    arcMaterial.dispose();
    dotGeometry.dispose();
    dotMaterial.dispose();
  });

  return group;
}
