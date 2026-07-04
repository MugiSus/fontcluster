import { type Accessor, createEffect, onCleanup } from 'solid-js';
import { Color, Group, NormalBlending, type Object3D } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { type DendrogramEdge } from '@/components/graph/dendrogram-edges';
import { type GraphCoordinate } from '@/components/graph/types';
import { getBackgroundColor, getClusterColor } from './cluster-colors-gl';

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

/** The selected font's merge-ancestry polyline and its stroke color. */
export interface DendrogramHighlight {
  /** Graph-space (y-down) polyline: the point, then successive merge centroids. */
  points: GraphCoordinate[];
  color: number;
}

export interface DendrogramLayerProps {
  /** The edges to draw, in graph space (y-down), ordered by merge rank. */
  edges: Accessor<DendrogramEdge[]>;
  /** The selected font's ancestry to emphasize, if any. */
  highlight: Accessor<DendrogramHighlight | null>;
  /** Whether the active theme is dark (picks cluster/background colors). */
  isDark: Accessor<boolean>;
  /** Viewport resolution `LineMaterial` needs for its pixel-space width. */
  resolution: Accessor<{ width: number; height: number }>;
  /** Schedules a repaint of the (on-demand) render loop. */
  requestRender: () => void;
}

/**
 * The radial dendrogram tree: the bracket chords of every merge — arcs plus
 * radial spokes (see `dendrogram-edges.ts`). Rendered between the origin axes
 * and the points (renderOrder -0.5) so the tree reads as a backplate under
 * the content.
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

  const group = new Group();
  let lines: LineSegments2 | null = null;
  let highlightLine: Line2 | null = null;

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
        const fade =
          FADE_NEAR - (FADE_NEAR - FADE_FAR) * (mergeIndex / lastMergeIndex);
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
      highlightMaterial.color.set(highlight.color);
      highlightLine = new Line2(geometry, highlightMaterial);
      highlightLine.frustumCulled = false;
      highlightLine.renderOrder = -0.4;
      group.add(highlightLine);
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

  onCleanup(() => {
    lines?.geometry.dispose();
    highlightLine?.geometry.dispose();
    material.dispose();
    highlightMaterial.dispose();
  });

  return group;
}
