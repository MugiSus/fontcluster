import { type Accessor, createEffect, onCleanup } from 'solid-js';
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
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
  type DendrogramEdge,
  type DendrogramNodeDot,
} from '@/components/graph/dendrogram-edges';
import { type GraphCoordinate } from '@/components/graph/types';
import { getBackgroundColor, getClusterColor } from './cluster-colors-gl';
import { fatLineFragmentShader, fatLineVertexShader } from './line-shaders';
import { coreFragmentShader, coreVertexShader } from './point-shaders';

/** Stroke width in CSS px; fat lines keep a solid core. */
const EDGE_WIDTH_PX = 1;
/** Uniform opacity on top of the per-segment fade, so crossing segments blend
 *  instead of the later (coarser) one occluding the finer one. */
const EDGE_OPACITY = 1.0;
/** Extra opacity multiplier for leaf/alias spokes whose representative font is
 *  filtered out or weight-inactive. */
const FILTERED_EDGE_OPACITY = 0.4;
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

/**
 * A `Line2` / `LineSegments2` material driven by our own fat-line shader
 * (see `line-shaders.ts`), which anti-aliases every stroke in-shader — the graph
 * renders without MSAA (`use-graph-gl-renderer`), so points, rings and these
 * edges all feather themselves. This replaces three's built-in `LineMaterial`,
 * whose fragment shader only hard-`discard`s past the stroke edge (leaving the
 * diagonal arcs and spokes to stair-step) and whose `alphaToCoverage` ramp
 * covers only the round caps and leans on MSAA for the long edges.
 *
 * `vertexColors` toggles the shader's `USE_COLOR` path: the edges carry a
 * per-segment color, the ancestry highlight takes the flat `diffuse` uniform.
 * The layer keeps `resolution`, `diffuse` and `opacity` uniforms in sync via the
 * effects below (the same values `LineMaterial` exposed as `.resolution` etc.).
 */
function createFatLineMaterial(options: {
  color: number;
  linewidth: number;
  opacity: number;
  hasVertexColors: boolean;
}): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      diffuse: { value: new Color(options.color) },
      opacity: { value: options.opacity },
      linewidth: { value: options.linewidth },
      resolution: { value: new Vector2(1, 1) },
    },
    vertexShader: fatLineVertexShader,
    fragmentShader: fatLineFragmentShader,
    vertexColors: options.hasVertexColors,
    transparent: true,
    depthTest: false,
    blending: NormalBlending,
  });
}

/** The selected font's merge-ancestry polyline and its stroke color. */
export interface DendrogramHighlight {
  /** Graph-space (y-down) polyline: the point, then successive merge centroids. */
  points: GraphCoordinate[];
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
  /** Representative font keys that are currently active/selectable. */
  activeKeys: Accessor<Set<string>>;
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
 * node. Rendered under the points (renderOrder -0.5) so the tree reads as a
 * backplate under the content.
 *
 * Two visual encodings are baked into per-segment vertex colors:
 * - merges whose subtree lies inside one final cluster take that cluster's
 *   color; merges spanning clusters fall back to the neutral gray that
 *   `getClusterColor` returns for `k = -1`;
 * - color fades towards the background with merge rank, so fine structure is
 *   vivid and the coarse trunks recede.
 * The node dots themselves behave like graph-point aliases: they use the
 * representative point color and the point-core shader's active/dimmed alpha.
 * Leaf/alias spokes carry their representative key and multiply alpha when the
 * same key is filtered out; merge arcs keep the base edge opacity.
 *
 * `LineSegmentsGeometry` has no in-place resize, so each edge/theme change
 * swaps in a freshly built geometry and disposes the old one. The render loop
 * owns the group's visibility across the glow passes.
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

  // The merge-node dots reuse the point layer's core sprite program: aColor
  // carries the representative color, aOpacity carries the alias depth fade,
  // and aHideCore suppresses the dot where the node's exemplar image is drawn
  // — exactly the leaf points' image behaviour.
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
      geometry.setAttribute(
        'instanceOpacity',
        new InstancedBufferAttribute(new Float32Array(edges.length).fill(1), 1),
      );
      lines = new LineSegments2(geometry, material as unknown as LineMaterial);
      lines.frustumCulled = false;
      lines.renderOrder = -0.5;
      group.add(lines);
    }
    props.requestRender();
  });

  // Leaf/alias spoke opacity follows the same filtered-key source as points,
  // labels and images. Merge arcs have no source key and stay at full opacity.
  createEffect(() => {
    const activeKeys = props.activeKeys();
    const edges = props.edges();
    const attribute = lines?.geometry.getAttribute('instanceOpacity');
    if (!attribute || attribute.count !== edges.length) return;

    const opacities = attribute.array as Float32Array;
    for (const [index, edge] of edges.entries()) {
      opacities[index] =
        edge.sourceKey && !activeKeys.has(edge.sourceKey)
          ? FILTERED_EDGE_OPACITY
          : 1;
    }
    attribute.needsUpdate = true;
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
      dotColor.set(getClusterColor({ k: dot.k, isDark }));
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

  // Device pixel ratio (dot sprite size = CSS px × dpr), like the point layer.
  createEffect(() => {
    dotMaterial.uniforms['uPixelRatio']!.value = props.pixelRatio();
    props.requestRender();
  });

  onCleanup(() => {
    lines?.geometry.dispose();
    highlightLine?.geometry.dispose();
    material.dispose();
    highlightMaterial.dispose();
    dotGeometry.dispose();
    dotMaterial.dispose();
  });

  return group;
}
