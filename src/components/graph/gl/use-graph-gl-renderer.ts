import {
  type Accessor,
  createEffect,
  createMemo,
  onCleanup,
  onMount,
} from 'solid-js';
import {
  ColorManagement,
  LinearSRGBColorSpace,
  OrthographicCamera,
  Scene,
  Vector2,
  WebGLRenderer,
} from 'three';
import { useColorMode } from '@kobalte/core';
import {
  type GraphCoordinate,
  type GraphPointData,
  type GraphPointLabel,
  type GraphViewBox,
} from '@/components/graph/types';
import {
  type DendrogramArc,
  type DendrogramEdge,
  type DendrogramImageAnchor,
  type DendrogramNodeDot,
} from '@/components/graph/dendrogram-edges';
import { type GraphLayout } from '@/components/graph/layouts/active-graph-layout';
import { getClusterColorAngle } from '@/lib/cluster-colors';
import { getBackgroundColor, getClusterColor } from './cluster-colors-gl';
import { createPointLabelLayer } from './point-label-layer';
import {
  createDendrogramLayer,
  dendrogramAliasGlowOpacityForRank,
  type DendrogramHighlight,
} from './dendrogram-layer';
import { createGlowCompositor } from './glow-compositor';
import { createImageLayer, type ImageSpec } from './image-layer';
import { createPointLayer, makeActivePredicate } from './point-layer';
import { createRingLayer, type RingKind, type RingSpec } from './ring-layer';
import { createScatterGridLayer } from './scatter-grid-layer';
import { createTreemapLayer } from './treemap-layer';

// Colors come straight from the CSS variables as sRGB, so disable three's
// linear<->sRGB conversion to keep the rendered hues WYSIWYG with the CSS theme.
ColorManagement.enabled = false;

/** Opacity of dimmed (filtered-out / inactive weight) sample images. */
const DIMMED_OPACITY = 0.4;
const NO_IMAGE_KEYS = new Set<string>();

export interface UseGraphGlRendererProps {
  getCanvas: () => HTMLCanvasElement | undefined;
  layout: Accessor<GraphLayout | null>;
  size: Accessor<{ width: number; height: number }>;
  viewBox: Accessor<GraphViewBox>;
  zoomFactor: Accessor<number>;
  points: Accessor<GraphPointData[]>;
  getPointByKey: (key: string) => GraphPointData | undefined;
  getPointsByFamilyName: (familyName: string) => readonly GraphPointData[];
  filteredKeys: Accessor<Set<string>>;
  selectedKey: Accessor<string | null>;
  selectedDendrogramAnchor: Accessor<DendrogramImageAnchor | null>;
  hoveredKey: Accessor<string | null>;
  selectedFamily: Accessor<string | null>;
  imageKeys: Accessor<Set<string>>;
  showImages: Accessor<boolean>;
  showFontNames: Accessor<boolean>;
  glow: Accessor<boolean>;
  showPointCore: Accessor<boolean>;
  showTreemapBoundaries: Accessor<boolean>;
  dendrogramEdges: Accessor<DendrogramEdge[]>;
  dendrogramArcs: Accessor<DendrogramArc[]>;
  dendrogramNodeDots: Accessor<DendrogramNodeDot[]>;
  dendrogramImageAnchors: Accessor<DendrogramImageAnchor[]>;
  pointLabels: Accessor<GraphPointLabel[]>;
  dendrogramAncestry: Accessor<GraphCoordinate[]>;
  sessionKey: Accessor<string>;
  sampleImageUrl: (safeName: string) => string | undefined;
}

/**
 * Orchestrates the GPU graph renderer.
 *
 * Responsibilities are split across composable layers — see
 * {@link createDendrogramLayer}, {@link createTreemapLayer},
 * {@link createPointLayer}, {@link createRingLayer} and
 * {@link createImageLayer}. Each layer is constructed with accessors and owns
 * its own reactive updates (Solid manages its objects' lifecycle and teardown);
 * this hook only derives their inputs (e.g. the ring/image specs), wires the
 * on-demand render loop, and owns the renderer, scene, camera and glow
 * compositor. It is a pure renderer of derived state — it never mutates
 * application state.
 */
export function useGraphGlRenderer(props: UseGraphGlRendererProps) {
  const { colorMode } = useColorMode();

  onMount(() => {
    const canvas = props.getCanvas();
    if (!canvas) return;

    // --- core: renderer, scene, camera -----------------------------------
    const renderer = new WebGLRenderer({
      canvas,
      // No MSAA: points, rings and dendrogram edges anti-alias themselves
      // in-shader, so it only adds full-framebuffer cost.
      antialias: false,
      // Intentionally NOT 'high-performance': on macOS that can put WebGL on the
      // discrete GPU while the window composites on the integrated one, forcing a
      // full-framebuffer GPU-to-GPU copy every frame (scales with dpr×resolution
      // — the main full-screen pan cost). 'default' keeps it on the compositor's
      // GPU.
      powerPreference: 'default',
    });
    // We author every color as raw sRGB hex (see cluster-colors-gl) and our own
    // shaders emit it directly. Built-in materials (LineMaterial) would re-encode
    // linear->sRGB on output and wash the colors out, so disable that output
    // conversion: combined with ColorManagement off, the whole pipeline is a raw
    // passthrough and lines match the points / background.
    renderer.outputColorSpace = LinearSRGBColorSpace;

    const scene = new Scene();
    // Orthographic, y-up: world Y is the negated graph Y (graph space is
    // y-down), so a standard camera maps it the right way up.
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    camera.position.z = 10;

    // --- on-demand render loop -------------------------------------------
    // Nothing animates continuously; render a single frame whenever a reactive
    // dependency or an async texture asks for one. `renderFrame` runs from
    // requestAnimationFrame — outside Solid's tracking scope — so it reads the
    // signals/hooks directly (a plain value read, no subscription); the effects
    // below only schedule a frame when those inputs change. `rafId` is the lone
    // piece of genuine mutable state: the dedupe token for the pending frame.
    let rafId: number | undefined;
    let hasRenderedFrame = false;

    const renderFrame = () => {
      rafId = undefined;

      const { core, halo } = pointLayer;
      const isDarkMode = isDark();
      // The label layer shows for the toolbar toggle, plus selected/family
      // image labels while their sample images are drawn.
      const showLabels =
        props.showFontNames() || forcedImageLabelKeys().size > 0;
      const showTreemapBoundaries = props.showTreemapBoundaries();

      // Glow off: draw the sharp content (core dots + rings + images + tree)
      // straight to the screen. The halo object is only used by the bloom path.
      if (!props.glow()) {
        halo.visible = false;
        dendrogramAliasHaloLayer.halo.visible = false;
        core.visible = true;
        scatterGridLayer.visible = true;
        treemapLayer.visible = showTreemapBoundaries;
        dendrogramLayer.visible = true;
        pointLabelLayer.visible = showLabels;
        ringLayer.visible = true;
        imageLayer.visible = true;
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        hasRenderedFrame = true;
        canvas.style.visibility = '';
        return;
      }

      // The glow's overlapping halos band when 'over'-composited straight onto an
      // 8-bit screen, so route the glow through the half-float bloom buffer where
      // the accumulation stays smooth.

      // 1) Glow pass: halos only, into the half-float bloom buffer (cleared to
      //    transparent black so the premultiplied halos accumulate from zero).
      halo.visible = true;
      dendrogramAliasHaloLayer.halo.visible = true;
      core.visible = false;
      scatterGridLayer.visible = false;
      treemapLayer.visible = false;
      dendrogramLayer.visible = false;
      pointLabelLayer.visible = false;
      ringLayer.visible = false;
      imageLayer.visible = false;
      renderer.setRenderTarget(compositor.target);
      renderer.setClearColor(0x000000, 0);
      renderer.render(scene, camera);
      renderer.setClearColor(getBackgroundColor({ isDark: isDarkMode }), 1);

      // 2) Background + backplate (σ grid + dendrogram edges) to the screen.
      //    Drawn before the composite so the glow sits above them but below
      //    the sharp content drawn last.
      halo.visible = false;
      dendrogramAliasHaloLayer.halo.visible = false;
      scatterGridLayer.visible = true;
      treemapLayer.visible = showTreemapBoundaries;
      dendrogramLayer.visible = true;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);

      // 3) Composite the upsampled glow over the background + tree.
      compositor.composite(renderer);

      // 4) Sharp pass: core dots + labels + rings + images over the composite
      //    (the dendrogram edges are already drawn). autoClear off so the
      //    glow/background isn't wiped.
      core.visible = true;
      dendrogramAliasHaloLayer.halo.visible = false;
      scatterGridLayer.visible = false;
      treemapLayer.visible = false;
      dendrogramLayer.visible = false;
      pointLabelLayer.visible = showLabels;
      ringLayer.visible = true;
      imageLayer.visible = true;
      // eslint-disable-next-line @typescript-eslint/naming-convention -- captures three.js renderer.autoClear to restore after render
      const previousAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(scene, camera);
      renderer.autoClear = previousAutoClear;

      // Leave the scene in a sane default for any stray render.
      scatterGridLayer.visible = true;
      treemapLayer.visible = showTreemapBoundaries;
      dendrogramLayer.visible = true;
      dendrogramAliasHaloLayer.halo.visible = false;
      hasRenderedFrame = true;
      canvas.style.visibility = '';
    };
    const scheduleRender = () => {
      if (rafId !== undefined) return;
      rafId = window.requestAnimationFrame(renderFrame);
    };

    // --- shared derived state --------------------------------------------
    const isDark = () => colorMode() === 'dark';
    // Device pixel ratio, re-read on resize (the only time it changes here); the
    // renderer and the point sprite both size to it.
    const pixelRatio = createMemo(() => {
      props.size();
      return window.devicePixelRatio;
    });
    // The active/dimmed rule, derived once and shared by the points, rings and
    // images (a point is active when it passes the graph filter).
    const activePredicate = createMemo(() =>
      makeActivePredicate(props.filteredKeys()),
    );
    const dendrogramAliasGlowOpacity = createMemo(() => {
      const aliases = props.dendrogramNodeDots();
      const lastMergeIndex = aliases[aliases.length - 1]?.mergeIndex || 1;
      return (point: GraphPointData) =>
        dendrogramAliasGlowOpacityForRank(
          (point as DendrogramNodeDot).mergeIndex,
          lastMergeIndex,
        );
    });

    // The highlight rings to show (selection / hover / family). Each font gets
    // at most one ring (selected wins), dimmed with the same active/dimmed rule
    // as the points and images when it is filtered out / weight-inactive.
    const ringSpecs = createMemo<RingSpec[]>(() => {
      const selected = props.selectedKey();
      const hovered = props.hoveredKey();
      const family = props.selectedFamily();
      const selectedDendrogramAnchor = props.selectedDendrogramAnchor();
      const isDarkMode = isDark();
      const predicate = activePredicate();

      // Dedupe per font, keeping the strongest affordance (selected > hover >
      // family) via later overwrites; the layer maps each kind to a radius.
      const kindByKey = new Map<string, RingKind>();
      if (family) {
        for (const point of props.getPointsByFamilyName(family)) {
          kindByKey.set(point.key, 'family');
        }
      }
      if (hovered) kindByKey.set(hovered, 'hover');
      if (selectedDendrogramAnchor) {
        kindByKey.set(selectedDendrogramAnchor.safeName, 'alias-source');
      }
      if (selected && !selectedDendrogramAnchor) {
        kindByKey.set(selected, 'selected');
      }

      const specs: RingSpec[] = [];
      for (const [key, kind] of kindByKey) {
        const point = props.getPointByKey(key);
        if (!point) continue;
        specs.push({
          x: point.x,
          y: -point.y,
          color: getClusterColor({
            angle: getClusterColorAngle(
              point.item.computed?.clustering?.leaf_angle,
              point.item.computed?.clustering?.cluster_angle,
            ),
            isDark: isDarkMode,
          }),
          kind,
          opacity: predicate(point) ? 1 : DIMMED_OPACITY,
        });
      }
      if (selectedDendrogramAnchor) {
        specs.push({
          x: selectedDendrogramAnchor.x,
          y: -selectedDendrogramAnchor.y,
          color: getClusterColor({
            angle: selectedDendrogramAnchor.colorAngle,
            isDark: isDarkMode,
          }),
          kind: 'selected',
          opacity: predicate(selectedDendrogramAnchor) ? 1 : DIMMED_OPACITY,
        });
      }
      return specs;
    });

    const forcedLeafImageKeys = createMemo(() => {
      const keys = new Set<string>();
      const selected = props.selectedKey();
      const family = props.selectedFamily();
      if (selected) keys.add(selected);
      if (family) {
        for (const point of props.getPointsByFamilyName(family)) {
          keys.add(point.key);
        }
      }
      return keys;
    });

    // The sample images to show. Selected / family-highlighted leaves always
    // show their image, but still dim with their ring when filtered out /
    // weight-inactive.
    const imageSpecs = createMemo<ImageSpec[]>(() => {
      const imageKeys = props.imageKeys();
      const selectedDendrogramAnchor = props.selectedDendrogramAnchor();
      const showImages = props.showImages();
      const predicate = activePredicate();
      const isDarkMode = isDark();

      const wanted = new Set<string>();
      if (showImages) for (const key of imageKeys) wanted.add(key);
      for (const key of forcedLeafImageKeys()) wanted.add(key);

      const specs: ImageSpec[] = [];
      for (const key of wanted) {
        const point = props.getPointByKey(key);
        if (!point || !point.item.meta.safe_name) continue;
        specs.push({
          key,
          safeName: point.item.meta.safe_name,
          x: point.x,
          y: -point.y,
          color: getClusterColor({
            angle: getClusterColorAngle(
              point.item.computed?.clustering?.leaf_angle,
              point.item.computed?.clustering?.cluster_angle,
            ),
            isDark: isDarkMode,
          }),
          opacity: predicate(point) ? 1 : DIMMED_OPACITY,
        });
      }

      // Merge-node aliases use the same image thinning as
      // ordinary points upstream. Node keys live in their own namespace: the
      // same font may represent several nodes (and its own leaf) at once, and
      // the pooled meshes must not collide — the texture cache still dedupes
      // by safe name, so no extra loads happen. A selected alias keeps its
      // image visible the same way a selected ordinary point does.
      const dendrogramAnchors = new Map<string, DendrogramImageAnchor>();
      for (const anchor of props.dendrogramImageAnchors()) {
        dendrogramAnchors.set(anchor.key, anchor);
      }
      if (selectedDendrogramAnchor) {
        dendrogramAnchors.set(
          selectedDendrogramAnchor.key,
          selectedDendrogramAnchor,
        );
      }
      for (const anchor of dendrogramAnchors.values()) {
        specs.push({
          key: anchor.key,
          safeName: anchor.safeName,
          x: anchor.x,
          y: -anchor.y,
          color: getClusterColor({
            angle: anchor.colorAngle,
            isDark: isDarkMode,
          }),
          opacity: predicate(anchor) ? 1 : DIMMED_OPACITY,
        });
      }
      return specs;
    });

    // Keys whose image is actually drawn; the point layer hides their core dot
    // (the glow stays). Derived from imageSpecs so "core hidden" tracks "image
    // shown" exactly.
    const imageShownKeys = createMemo(
      () => new Set(imageSpecs().map((spec) => spec.key)),
    );
    const forcedImageLabelKeys = createMemo(() => {
      const shown = imageShownKeys();
      const keys = new Set<string>();
      for (const key of forcedLeafImageKeys()) {
        if (shown.has(key)) keys.add(key);
      }
      return keys;
    });

    // Merge nodes whose exemplar image is drawn; the dendrogram layer hides
    // their node dot the same way.
    const anchoredNodeIndexes = createMemo(() => {
      const nodeIndexes = new Set(
        props.dendrogramImageAnchors().map((anchor) => anchor.nodeIndex),
      );
      const selectedDendrogramAnchor = props.selectedDendrogramAnchor();
      if (selectedDendrogramAnchor) {
        nodeIndexes.add(selectedDendrogramAnchor.nodeIndex);
      }
      return nodeIndexes;
    });

    // The selected font's merge ancestry, stroked in its cluster color.
    const dendrogramHighlight = createMemo<DendrogramHighlight | null>(() => {
      const points = props.dendrogramAncestry();
      if (points.length < 2) return null;
      const selected = props.selectedKey();
      const point = selected ? props.getPointByKey(selected) : undefined;
      return {
        points,
        color: getClusterColor({
          angle: getClusterColorAngle(
            point?.item.computed?.clustering?.leaf_angle,
            point?.item.computed?.clustering?.cluster_angle,
          ),
          isDark: isDark(),
        }),
      };
    });

    // --- layers (one scene; render order keeps images over rings over dots) -
    // Each layer owns its own reactive updates from the accessors below; this
    // hook only constructs them, wires the render loop, and sizes the renderer.
    const compositor = createGlowCompositor();
    const scatterGridLayer = createScatterGridLayer({
      lines: () => {
        const layout = props.layout();
        return layout?.mode === 'scatter-plot' ? layout.gridLines : [];
      },
      isDark,
      resolution: props.size,
      requestRender: scheduleRender,
    });
    const treemapLayer = createTreemapLayer({
      layout: () => {
        const layout = props.layout();
        return layout?.mode === 'rectangular-treemap' ||
          layout?.mode === 'voronoi-treemap'
          ? layout
          : null;
      },
      isDark,
      resolution: props.size,
      requestRender: scheduleRender,
    });
    const dendrogramLayer = createDendrogramLayer({
      edges: props.dendrogramEdges,
      arcs: props.dendrogramArcs,
      dots: props.dendrogramNodeDots,
      imageNodeIndexes: anchoredNodeIndexes,
      highlight: dendrogramHighlight,
      activeKeys: props.filteredKeys,
      isDark,
      resolution: props.size,
      zoom: props.zoomFactor,
      pixelRatio,
      requestRender: scheduleRender,
    });
    const pointLabelLayer = createPointLabelLayer({
      labels: props.pointLabels,
      // The image layer's screen-space thinning + viewport cull set the label
      // density too (`imageKeys` is computed whether or not images are shown).
      visibleKeys: props.imageKeys,
      activeKeys: props.filteredKeys,
      showImages: props.showImages,
      showFontNames: props.showFontNames,
      forcedImageLabelKeys,
      isDark,
      zoom: props.zoomFactor,
      requestRender: scheduleRender,
    });
    const pointLayer = createPointLayer({
      points: props.points,
      showCore: props.showPointCore,
      isDark,
      activePredicate,
      imageShownKeys,
      pixelRatio,
      glowScale: compositor.glowScale,
      requestRender: scheduleRender,
    });
    const dendrogramAliasHaloLayer = createPointLayer({
      points: props.dendrogramNodeDots,
      showCore: () => false,
      isDark,
      activePredicate,
      opacityForPoint: dendrogramAliasGlowOpacity,
      imageShownKeys: () => NO_IMAGE_KEYS,
      pixelRatio,
      glowScale: compositor.glowScale,
      requestRender: scheduleRender,
    });
    const ringLayer = createRingLayer({
      specs: ringSpecs,
      zoom: props.zoomFactor,
      requestRender: scheduleRender,
    });
    const imageLayer = createImageLayer({
      specs: imageSpecs,
      sessionKey: props.sessionKey,
      sampleImageUrl: props.sampleImageUrl,
      zoom: props.zoomFactor,
      requestRender: scheduleRender,
    });
    scene.add(scatterGridLayer);
    scene.add(treemapLayer);
    scene.add(dendrogramLayer);
    scene.add(pointLabelLayer);
    scene.add(pointLayer.core);
    scene.add(pointLayer.halo);
    scene.add(dendrogramAliasHaloLayer.halo);
    scene.add(ringLayer);
    scene.add(imageLayer);

    // --- effect: clear color (theme) -------------------------------------
    // The renderer's clear color is the theme background; each layer handles its
    // own theme response (colors / blending) from the accessors above.
    createEffect(() => {
      renderer.setClearColor(getBackgroundColor({ isDark: isDark() }), 1);
      scheduleRender();
    });

    // --- effect: glow / font-name toggles ---------------------------------
    // `renderFrame` switches between the bloom and straight paths on `glow`
    // and gates the label layer on font-name / selected-image visibility, but
    // it reads those accessors untracked (it runs in rAF), so subscribe here.
    createEffect(() => {
      props.glow();
      props.showFontNames();
      props.showTreemapBoundaries();
      forcedImageLabelKeys();
      scheduleRender();
    });

    // --- effect: renderer sizing -----------------------------------------
    const drawingBufferSize = new Vector2();
    createEffect(() => {
      const { width, height } = props.size();
      if (width <= 0 || height <= 0) return;
      const nextPixelRatio = pixelRatio();
      const isCanvasSizeChanging =
        canvas.style.width !== `${width}px` ||
        canvas.style.height !== `${height}px` ||
        renderer.getPixelRatio() !== nextPixelRatio;
      if (hasRenderedFrame && isCanvasSizeChanging) {
        canvas.style.visibility = 'hidden';
      }
      renderer.setPixelRatio(nextPixelRatio);
      // The renderer owns both the drawing buffer and the canvas CSS size.
      // Letting `size-full` resize the CSS box first stretches the previous
      // framebuffer until ResizeObserver updates the drawing buffer.
      renderer.setSize(width, height, true);
      // Size the glow buffer from the actual drawing-buffer resolution
      // (getDrawingBufferSize already folds in pixelRatio); the compositor then
      // applies its own GLOW_SCALE. The point sprite + line layers track pixel
      // ratio / resolution via their own accessors.
      renderer.getDrawingBufferSize(drawingBufferSize);
      compositor.setSize(drawingBufferSize.x, drawingBufferSize.y);
      scheduleRender();
    });

    // --- effect: camera sync (matches SVG `xMidYMid meet`) ---------------
    createEffect(() => {
      const { width, height } = props.size();
      const viewBox = props.viewBox();
      if (
        width <= 0 ||
        height <= 0 ||
        viewBox.width <= 0 ||
        viewBox.height <= 0
      ) {
        return;
      }
      // "meet": fit the whole viewBox, letterboxing the longer screen axis.
      const scale = Math.min(width / viewBox.width, height / viewBox.height);
      const visibleWidth = width / scale;
      const visibleHeight = height / scale;
      const centerX = viewBox.x + viewBox.width / 2;
      const centerY = viewBox.y + viewBox.height / 2;

      camera.left = centerX - visibleWidth / 2;
      camera.right = centerX + visibleWidth / 2;
      // World Y is the negated graph Y, so this is a standard y-up camera.
      camera.top = -centerY + visibleHeight / 2;
      camera.bottom = -centerY - visibleHeight / 2;
      camera.updateProjectionMatrix();
      scheduleRender();
    });

    onCleanup(() => {
      if (rafId !== undefined) window.cancelAnimationFrame(rafId);
      // The layers own their own teardown (Solid disposes their effects /
      // onCleanups with this owner); the compositor and renderer do not.
      compositor.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    });
  });
}
