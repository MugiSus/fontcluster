import { type Accessor, createEffect, onCleanup } from 'solid-js';
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  NormalBlending,
  type Object3D,
  Points,
  ShaderMaterial,
} from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import {
  type DendrogramEdge,
  type DendrogramNodeDot,
} from '@/components/graph/dendrogram-edges';
import { type GraphCoordinate } from '@/components/graph/types';
import { getBackgroundColor, getClusterColor } from './cluster-colors-gl';
import { coreFragmentShader, coreVertexShader } from './point-shaders';

/** Stroke width in CSS px; fat lines keep a solid core (see axis-layer). */
const EDGE_WIDTH_PX = 1;
/** Uniform opacity on top of the per-segment fade, so crossing segments blend
 *  instead of the later (coarser) one occluding the finer one. */
const EDGE_OPACITY = 1.0;
/** Per-segment fade: the finest merge draws at NEAR, the coarsest at FAR. The
 *  fade is baked into the vertex colors as a lerp towards the background, so
 *  the tree recedes with depth without needing per-vertex alpha. */
const FADE_NEAR = 0.9;
const FADE_FAR = 0.3;
/** The ancestry highlight is the mode's focal line: slightly wider and near
 *  opaque so it stands out of the faded tree. */
const HIGHLIGHT_WIDTH_PX = 1.5;
const HIGHLIGHT_OPACITY = 0.9;
/** Merge-node dot diameter (CSS px); matches the point layer's core dots so
 *  branch points read like the leaf points. */
const NODE_DOT_PX = 3.5;

/** Depth fade of a merge's color towards the background (shared by the edges
 *  and the node dots so a dot sits tonally on its own bracket). */
const fadeForRank = (mergeIndex: number, lastMergeIndex: number) =>
  FADE_NEAR - (FADE_NEAR - FADE_FAR) * (mergeIndex / lastMergeIndex);

/**
 * Analytic edge anti-aliasing for three's `LineMaterial`.
 *
 * The graph renders without MSAA (see `use-graph-gl-renderer`: points, rings and
 * axes all anti-alias themselves in-shader), but the stock `LineMaterial` only
 * hard-`discard`s past the stroke edge, so the dendrogram's diagonal arcs and
 * spokes stair-step. `alphaToCoverage` wouldn't help — its analytic ramp covers
 * only the round caps and leans on MSAA for the long edges.
 *
 * So we patch the fragment shader's discard branch into a ~1px coverage ramp,
 * driven by the width-normalized distance from the stroke centerline (`|vUv.x|`
 * along the body, radial past the caps where `|vUv.y| > 1`) scaled to screen
 * pixels via `fwidth`. Combined with the material's existing alpha blending this
 * feathers every edge. A distinct `customProgramCacheKey` keeps this program out
 * of the (identically-sourced) axis `LineMaterial`'s cache slot, and the guard
 * fails loud if a three.js upgrade moves the branch out from under the patch.
 */
function antialiasLineMaterial(material: LineMaterial): void {
  material.customProgramCacheKey = () => 'dendrogram-line-aa';
  material.onBeforeCompile = (shader) => {
    const patched = shader.fragmentShader.replace(
      /if \( abs\( vUv\.y \) > 1\.0 \) \{\s*float a = vUv\.x;[\s\S]*?discard;\s*\}/,
      `
					// This pipeline renders without MSAA, so fade alpha across a ~1px
					// coverage ramp at the stroke edge — |vUv.x| along the body, radial
					// past the round caps — for in-shader anti-aliasing.
					float capExtent = max( abs( vUv.y ) - 1.0, 0.0 );
					float edgeDistance = length( vec2( vUv.x, capExtent ) );
					alpha *= clamp( ( 1.0 - edgeDistance ) / max( fwidth( edgeDistance ), 1e-4 ) + 0.5, 0.0, 1.0 );
      `,
    );
    if (patched === shader.fragmentShader) {
      throw new Error(
        'dendrogram AA patch did not match LineMaterial; three.js shader changed',
      );
    }
    shader.fragmentShader = patched;
  };
}

/** The selection emphasis: the merge-ancestry polyline, the selected merge
 *  node's subtree segments, and their shared stroke color. */
export interface DendrogramHighlight {
  /** Graph-space (y-down) polyline: the point, then successive merge centroids. */
  points: GraphCoordinate[];
  /** Graph-space (y-down) segments of the selected node's subtree, if any. */
  segments: DendrogramEdge[];
  color: number;
}

export interface DendrogramLayerProps {
  /** The edges to draw, in graph space (y-down), ordered by merge rank. */
  edges: Accessor<DendrogramEdge[]>;
  /** The merge-node dots to draw, in merge order. */
  dots: Accessor<DendrogramNodeDot[]>;
  /** Node indexes whose exemplar image is drawn; their dot is hidden (the
   *  image replaces it, like the point layer's `aHideCore`). */
  imageNodeIndexes: Accessor<Set<number>>;
  /** The selected font's ancestry to emphasize, if any. */
  highlight: Accessor<DendrogramHighlight | null>;
  /** Whether the active theme is dark (picks cluster/background colors). */
  isDark: Accessor<boolean>;
  /** Viewport resolution `LineMaterial` needs for its pixel-space width. */
  resolution: Accessor<{ width: number; height: number }>;
  /** Device pixel ratio; the node dot sprite sizes to it. */
  pixelRatio: Accessor<number>;
  /** Schedules a repaint of the (on-demand) render loop. */
  requestRender: () => void;
}

/**
 * The radial dendrogram tree: the bracket chords of every merge — arcs plus
 * radial spokes (see `dendrogram-edges.ts`) — and a data dot at every merge
 * node. Rendered between the origin axes and the points (renderOrder -0.5)
 * so the tree reads as a backplate under the content.
 *
 * Two visual encodings are baked into per-segment vertex colors:
 * - merges whose subtree lies inside one final cluster take that cluster's
 *   color; merges spanning clusters fall back to the neutral gray that
 *   `getClusterColor` returns for `k = -1`;
 * - color fades towards the background with merge rank, so fine structure is
 *   vivid and the coarse trunks recede.
 *
 * `LineSegmentsGeometry` has no in-place resize, so each edge/theme change
 * swaps in a freshly built geometry and disposes the old one. The render loop
 * owns the group's visibility (the mode toggle and the glow passes).
 */
export function createDendrogramLayer(props: DendrogramLayerProps): Object3D {
  const material = new LineMaterial({
    color: 0xffffff,
    linewidth: EDGE_WIDTH_PX,
    vertexColors: true,
    transparent: true,
    opacity: EDGE_OPACITY,
    depthTest: false,
    blending: NormalBlending,
  });
  const highlightMaterial = new LineMaterial({
    linewidth: HIGHLIGHT_WIDTH_PX,
    transparent: true,
    opacity: HIGHLIGHT_OPACITY,
    depthTest: false,
    blending: NormalBlending,
  });
  antialiasLineMaterial(material);
  antialiasLineMaterial(highlightMaterial);

  // The merge-node dots reuse the point layer's core sprite program: aColor
  // carries the depth-faded merge color, aState stays active, and aHideCore
  // suppresses the dot where the node's exemplar image is drawn — exactly the
  // leaf points' image behaviour.
  const dotGeometry = new BufferGeometry();
  const dotMaterial = new ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: 1 },
      uCore: { value: NODE_DOT_PX },
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
  let highlightLine: Line2 | null = null;
  let highlightSegments: LineSegments2 | null = null;

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
      const colors = edges.flatMap(({ mergeIndex, k }) => {
        const fade = fadeForRank(mergeIndex, lastMergeIndex);
        segmentColor.set(getClusterColor({ k, isDark }));
        segmentColor.lerpColors(background, segmentColor, fade);
        const { r, g, b } = segmentColor;
        return [r, g, b, r, g, b];
      });

      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(positions);
      geometry.setColors(colors);
      lines = new LineSegments2(geometry, material);
      lines.frustumCulled = false;
      lines.renderOrder = -0.5;
      group.add(lines);
    }
    props.requestRender();
  });

  // Node dot positions + colors (rebuilt with the dot set / theme, like the
  // edges above). aHideCore is owned by the effect below.
  createEffect(() => {
    const nodeDots = props.dots();
    const isDark = props.isDark();
    const count = nodeDots.length;
    const lastMergeIndex = nodeDots[count - 1]?.mergeIndex || 1;
    const background = new Color(getBackgroundColor({ isDark }));
    const dotColor = new Color();

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (const [index, dot] of nodeDots.entries()) {
      positions[index * 3] = dot.x;
      // World Y is the negated graph Y (graph space is y-down).
      positions[index * 3 + 1] = -dot.y;
      positions[index * 3 + 2] = 0;
      dotColor.set(getClusterColor({ k: dot.k, isDark }));
      dotColor.lerpColors(
        background,
        dotColor,
        fadeForRank(dot.mergeIndex, lastMergeIndex),
      );
      colors[index * 3] = dotColor.r;
      colors[index * 3 + 1] = dotColor.g;
      colors[index * 3 + 2] = dotColor.b;
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
      'aHideCore',
      new Float32BufferAttribute(new Float32Array(count), 1),
    );
    dotGeometry.setDrawRange(0, count);
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

  // The selection emphasis: the ancestry as a continuous polyline, plus —
  // when a merge node's sample is the selection — every segment of that
  // node's subtree, both in the highlight stroke. Neither geometry has an
  // in-place resize, so both rebuild per selection change.
  createEffect(() => {
    const highlight = props.highlight();
    if (highlightLine) {
      group.remove(highlightLine);
      highlightLine.geometry.dispose();
      highlightLine = null;
    }
    if (highlightSegments) {
      group.remove(highlightSegments);
      highlightSegments.geometry.dispose();
      highlightSegments = null;
    }
    if (highlight) {
      highlightMaterial.color.set(highlight.color);
      if (highlight.points.length >= 2) {
        // World Y is the negated graph Y (graph space is y-down).
        const positions = highlight.points.flatMap(({ x, y }) => [x, -y, 0]);
        const geometry = new LineGeometry();
        geometry.setPositions(positions);
        highlightLine = new Line2(geometry, highlightMaterial);
        highlightLine.frustumCulled = false;
        highlightLine.renderOrder = -0.4;
        group.add(highlightLine);
      }
      if (highlight.segments.length > 0) {
        const positions = highlight.segments.flatMap(({ x1, y1, x2, y2 }) => [
          x1,
          -y1,
          0,
          x2,
          -y2,
          0,
        ]);
        const geometry = new LineSegmentsGeometry();
        geometry.setPositions(positions);
        highlightSegments = new LineSegments2(geometry, highlightMaterial);
        highlightSegments.frustumCulled = false;
        highlightSegments.renderOrder = -0.4;
        group.add(highlightSegments);
      }
    }
    props.requestRender();
  });

  createEffect(() => {
    const { width, height } = props.resolution();
    if (width > 0 && height > 0) {
      material.resolution.set(width, height);
      highlightMaterial.resolution.set(width, height);
    }
    props.requestRender();
  });

  // Device pixel ratio (dot sprite size = CSS px × dpr), like the point layer.
  createEffect(() => {
    dotMaterial.uniforms['uPixelRatio']!.value = props.pixelRatio();
    props.requestRender();
  });

  onCleanup(() => {
    lines?.geometry.dispose();
    highlightLine?.geometry.dispose();
    highlightSegments?.geometry.dispose();
    material.dispose();
    highlightMaterial.dispose();
    dotGeometry.dispose();
    dotMaterial.dispose();
  });

  return group;
}
