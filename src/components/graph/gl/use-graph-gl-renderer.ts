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
import { type FontWeight } from '@/types/font';
import {
  type GraphCoordinate,
  type GraphPointData,
  type GraphViewBox,
} from '@/components/graph/types';
import {
  type DendrogramEdge,
  type DendrogramImageAnchor,
  type DendrogramNodeDot,
} from '@/components/graph/dendrogram-edges';
import { getBackgroundColor, getClusterColor } from './cluster-colors-gl';
import { createAxisLayer } from './axis-layer';
import {
  createDendrogramLayer,
  type DendrogramHighlight,
} from './dendrogram-layer';
import { createGlowCompositor } from './glow-compositor';
import { createImageLayer, type ImageSpec } from './image-layer';
import { createPointLayer, makeActivePredicate } from './point-layer';
import { createRingLayer, type RingKind, type RingSpec } from './ring-layer';

// Colors come straight from the CSS variables as sRGB, so disable three's
// linear<->sRGB conversion to keep the rendered hues WYSIWYG with the CSS theme.
ColorManagement.enabled = false;

/** Opacity of dimmed (filtered-out / inactive weight) sample images. */
const DIMMED_OPACITY = 0.4;

export interface UseGraphGlRendererProps {
  getCanvas: () => HTMLCanvasElement | undefined;
  size: Accessor<{ width: number; height: number }>;
  viewBox: Accessor<GraphViewBox>;
  origin: Accessor<GraphCoordinate>;
  zoomFactor: Accessor<number>;
  points: Accessor<GraphPointData[]>;
  getPointByKey: (key: string) => GraphPointData | undefined;
  getPointsByFamilyName: (familyName: string) => readonly GraphPointData[];
  filteredKeys: Accessor<Set<string>>;
  activeWeights: Accessor<FontWeight[]>;
  selectedKey: Accessor<string | null>;
  hoveredKey: Accessor<string | null>;
  selectedFamily: Accessor<string | null>;
  imageKeys: Accessor<Set<string>>;
  showImages: Accessor<boolean>;
  glow: Accessor<boolean>;
  dendrogramEdges: Accessor<DendrogramEdge[]>;
  dendrogramNodeDots: Accessor<DendrogramNodeDot[]>;
  dendrogramImageAnchors: Accessor<DendrogramImageAnchor[]>;
  showDendrogram: Accessor<boolean>;
  dendrogramAncestry: Accessor<GraphCoordinate[]>;
  dendrogramSubtreeEdges: Accessor<DendrogramEdge[]>;
  sessionDirectory: Accessor<string>;
}

/**
 * Orchestrates the GPU graph renderer.
 *
 * Responsibilities are split across composable layers — see
 * {@link createAxisLayer}, {@link createPointLayer}, {@link createRingLayer} and
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
      // No MSAA: points, rings and axes anti-alias themselves in-shader, so it
      // only adds full-framebuffer cost.
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

    const renderFrame = () => {
      rafId = undefined;

      const { core, halo } = pointLayer;
      const isDarkMode = isDark();
      // The mode toggle is folded into every per-pass visibility switch below,
      // so the dendrogram only ever draws where the axes backplate draws.
      const showDendrogram = props.showDendrogram();

      // Glow off: draw the sharp content (core dots + rings + images + axes)
      // straight to the screen. The halo object is only used by the bloom path.
      // The origin crosshair belongs to the map layout's score space, so the
      // dendrogram (radial) mode swaps it for the tree.
      if (!props.glow()) {
        halo.visible = false;
        core.visible = true;
        axisLayer.visible = !showDendrogram;
        dendrogramLayer.visible = showDendrogram;
        ringLayer.visible = true;
        imageLayer.visible = true;
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }

      // The glow's overlapping halos band when 'over'-composited straight onto an
      // 8-bit screen, so route the glow through the half-float bloom buffer where
      // the accumulation stays smooth.

      // 1) Glow pass: halos only, into the half-float bloom buffer (cleared to
      //    transparent black so the premultiplied halos accumulate from zero).
      halo.visible = true;
      core.visible = false;
      axisLayer.visible = false;
      dendrogramLayer.visible = false;
      ringLayer.visible = false;
      imageLayer.visible = false;
      renderer.setRenderTarget(compositor.target);
      renderer.setClearColor(0x000000, 0);
      renderer.render(scene, camera);
      renderer.setClearColor(getBackgroundColor({ isDark: isDarkMode }), 1);

      // 2) Background + axes (or dendrogram edges) to the screen. These are
      //    the backplate; draw them before the composite so the glow sits
      //    above them but below the sharp content drawn last.
      halo.visible = false;
      axisLayer.visible = !showDendrogram;
      dendrogramLayer.visible = showDendrogram;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);

      // 3) Composite the upsampled glow over the background + axes.
      compositor.composite(renderer);

      // 4) Sharp pass: core dots + rings + images over the composite (the axes
      //    and dendrogram edges are already drawn). autoClear off so the
      //    glow/background isn't wiped.
      core.visible = true;
      axisLayer.visible = false;
      dendrogramLayer.visible = false;
      ringLayer.visible = true;
      imageLayer.visible = true;
      // eslint-disable-next-line @typescript-eslint/naming-convention -- captures three.js renderer.autoClear to restore after render
      const previousAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(scene, camera);
      renderer.autoClear = previousAutoClear;

      // Leave the scene in a sane default for any stray render.
      axisLayer.visible = !showDendrogram;
      dendrogramLayer.visible = showDendrogram;
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
    // images (a point is active when it passes the filter and its weight is on).
    const activePredicate = createMemo(() =>
      makeActivePredicate(props.filteredKeys(), new Set(props.activeWeights())),
    );

    // The highlight rings to show (selection / hover / family). Each font gets
    // at most one ring (selected wins), dimmed with the same active/dimmed rule
    // as the points and images when it is filtered out / weight-inactive.
    const ringSpecs = createMemo<RingSpec[]>(() => {
      const selected = props.selectedKey();
      const hovered = props.hoveredKey();
      const family = props.selectedFamily();
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
      if (selected) kindByKey.set(selected, 'selected');

      const specs: RingSpec[] = [];
      for (const [key, kind] of kindByKey) {
        const point = props.getPointByKey(key);
        if (!point) continue;
        specs.push({
          x: point.x,
          y: -point.y,
          color: getClusterColor({
            k: point.item.computed?.clustering?.k,
            isDark: isDarkMode,
          }),
          kind,
          opacity: predicate(point) ? 1 : DIMMED_OPACITY,
        });
      }
      return specs;
    });

    // The sample images to show. The selected font always shows its image, but
    // it still dims with its ring when filtered out / weight-inactive.
    const imageSpecs = createMemo<ImageSpec[]>(() => {
      const imageKeys = props.imageKeys();
      const selected = props.selectedKey();
      const showImages = props.showImages();
      const predicate = activePredicate();
      const isDarkMode = isDark();

      const wanted = new Set<string>();
      if (showImages) for (const key of imageKeys) wanted.add(key);
      if (selected) wanted.add(selected);

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
            k: point.item.computed?.clustering?.k,
            isDark: isDarkMode,
          }),
          opacity: predicate(point) ? 1 : DIMMED_OPACITY,
        });
      }

      // Dendrogram mode: the merge nodes' exemplar samples (already gated on
      // the zoom-dependent span fit upstream — see the viewer's visible-anchor
      // memo, which is also the click hit-test source). Node keys live in
      // their own `dendrogram:` namespace: the same font may represent several
      // nodes (and its own leaf) at once, and the pooled meshes must not
      // collide — the texture cache still dedupes by safe name, so no extra
      // loads happen.
      if (props.showDendrogram()) {
        for (const anchor of props.dendrogramImageAnchors()) {
          specs.push({
            key: `dendrogram:${anchor.nodeIndex}`,
            safeName: anchor.safeName,
            x: anchor.x,
            y: -anchor.y,
            color: getClusterColor({ k: anchor.k, isDark: isDarkMode }),
            opacity: 1,
          });
        }
      }
      return specs;
    });

    // Keys whose image is actually drawn; the point layer hides their core dot
    // (the glow stays). Derived from imageSpecs so "core hidden" tracks "image
    // shown" exactly.
    const imageShownKeys = createMemo(
      () => new Set(imageSpecs().map((spec) => spec.key)),
    );

    // Merge nodes whose exemplar image is drawn; the dendrogram layer hides
    // their node dot the same way.
    const anchoredNodeIndexes = createMemo(
      () =>
        new Set(
          props.dendrogramImageAnchors().map((anchor) => anchor.nodeIndex),
        ),
    );

    // The selected font's merge ancestry — plus, when the selection is a
    // merge node's sample, that node's subtree — stroked in its cluster color.
    const dendrogramHighlight = createMemo<DendrogramHighlight | null>(() => {
      const points = props.dendrogramAncestry();
      const segments = props.dendrogramSubtreeEdges();
      if (points.length < 2 && segments.length === 0) return null;
      const selected = props.selectedKey();
      const point = selected ? props.getPointByKey(selected) : undefined;
      return {
        points,
        segments,
        color: getClusterColor({
          k: point?.item.computed?.clustering?.k,
          isDark: isDark(),
        }),
      };
    });

    // --- layers (one scene; render order keeps images over rings over dots) -
    // Each layer owns its own reactive updates from the accessors below; this
    // hook only constructs them, wires the render loop, and sizes the renderer.
    const compositor = createGlowCompositor();
    const axisLayer = createAxisLayer({
      origin: props.origin,
      isLight: () => !isDark(),
      resolution: props.size,
      requestRender: scheduleRender,
    });
    const dendrogramLayer = createDendrogramLayer({
      edges: props.dendrogramEdges,
      dots: props.dendrogramNodeDots,
      imageNodeIndexes: anchoredNodeIndexes,
      highlight: dendrogramHighlight,
      isDark,
      resolution: props.size,
      pixelRatio,
      requestRender: scheduleRender,
    });
    const pointLayer = createPointLayer({
      points: props.points,
      isDark,
      activePredicate,
      imageShownKeys,
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
      sessionDirectory: props.sessionDirectory,
      zoom: props.zoomFactor,
      requestRender: scheduleRender,
    });
    scene.add(axisLayer);
    scene.add(dendrogramLayer);
    scene.add(pointLayer.core);
    scene.add(pointLayer.halo);
    scene.add(ringLayer);
    scene.add(imageLayer);

    // --- effect: clear color (theme) -------------------------------------
    // The renderer's clear color is the theme background; each layer handles its
    // own theme response (colors / blending) from the accessors above.
    createEffect(() => {
      renderer.setClearColor(getBackgroundColor({ isDark: isDark() }), 1);
      scheduleRender();
    });

    // --- effect: glow / dendrogram on/off ---------------------------------
    // `renderFrame` switches between the bloom and straight paths on `glow` and
    // gates the dendrogram backplate on `showDendrogram`, but it reads them
    // untracked (it runs in rAF), so subscribe here to repaint.
    createEffect(() => {
      props.glow();
      props.showDendrogram();
      scheduleRender();
    });

    // --- effect: renderer sizing -----------------------------------------
    const drawingBufferSize = new Vector2();
    createEffect(() => {
      const { width, height } = props.size();
      if (width <= 0 || height <= 0) return;
      renderer.setPixelRatio(pixelRatio());
      renderer.setSize(width, height, false);
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
