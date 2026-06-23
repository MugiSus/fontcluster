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
import { type FontWeight } from '../../../types/font';
import {
  type GraphCoordinate,
  type GraphPointData,
  type GraphViewBox,
} from '../types';
import { getBackgroundColor, getClusterColor } from './cluster-colors-gl';
import { createAxisLayer } from './axis-layer';
import { createGlowCompositor } from './glow-compositor';
import { createImageLayer, type ImageSpec } from './image-layer';
import { createPointLayer, makeActivePredicate } from './point-layer';
import { createRingLayer, type RingSpec } from './ring-layer';

// Colors come straight from the CSS variables as sRGB, so disable three's
// linear<->sRGB conversion to keep the rendered hues WYSIWYG with the CSS theme.
ColorManagement.enabled = false;

// Highlight ring radii in CSS pixels (stroke width is constant; see RingLayer).
// Matches the original SVG circle radii (selected 40 / hover 20 / family 24).
const RING_RADIUS_SELECTED = 40;
const RING_RADIUS_HOVERED = 20;
const RING_RADIUS_FAMILY = 24;

/** Opacity of dimmed (filtered-out / inactive weight) sample images. */
const DIMMED_OPACITY = 0.4;

export interface UseGraphGlRendererProps {
  getCanvas: () => HTMLCanvasElement | undefined;
  size: Accessor<{ width: number; height: number }>;
  viewBox: Accessor<GraphViewBox>;
  origin: Accessor<GraphCoordinate>;
  zoomFactor: Accessor<number>;
  points: Accessor<GraphPointData[]>;
  filteredKeys: Accessor<Set<string>>;
  activeWeights: Accessor<FontWeight[]>;
  selectedKey: Accessor<string | null>;
  hoveredKey: Accessor<string | null>;
  selectedFamily: Accessor<string | null>;
  imageKeys: Accessor<Set<string>>;
  showImages: Accessor<boolean>;
  glow: Accessor<boolean>;
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
      const dark = isDark();

      // Glow off: draw the sharp content (core dots + rings + images + axes)
      // straight to the screen. The halo object is only used by the bloom path.
      if (!props.glow()) {
        halo.visible = false;
        core.visible = true;
        axisLayer.visible = true;
        ringLayer.visible = true;
        imageLayer.visible = true;
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }

      // The glow's overlapping halos band on an 8-bit screen (additively in dark
      // mode, 'over' in light mode), so route the glow through the bloom buffer.

      // 1) Glow pass: halos only, into the half-float bloom buffer (cleared to
      //    transparent black so the premultiplied halos accumulate from zero).
      halo.visible = true;
      core.visible = false;
      axisLayer.visible = false;
      ringLayer.visible = false;
      imageLayer.visible = false;
      renderer.setRenderTarget(compositor.target);
      renderer.setClearColor(0x000000, 0);
      renderer.render(scene, camera);
      renderer.setClearColor(getBackgroundColor({ isDark: dark }), 1);

      // 2) Background + axes to the screen. The axes are the backplate; draw them
      //    before the composite so the glow sits above them but below the sharp
      //    content drawn last.
      halo.visible = false;
      axisLayer.visible = true;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);

      // 3) Composite the upsampled glow over the background + axes.
      compositor.composite(renderer, dark);

      // 4) Sharp pass: core dots + rings + images over the composite (the axes
      //    are already drawn). autoClear off so the glow/background isn't wiped.
      core.visible = true;
      axisLayer.visible = false;
      ringLayer.visible = true;
      imageLayer.visible = true;
      const previousAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(scene, camera);
      renderer.autoClear = previousAutoClear;

      // Leave the scene in a sane default for any stray render.
      axisLayer.visible = true;
    };
    const scheduleRender = () => {
      if (rafId !== undefined) return;
      rafId = window.requestAnimationFrame(renderFrame);
    };

    // --- shared derived state --------------------------------------------
    const isDark = () => colorMode() === 'dark';
    // `pointByKey` lets the ring/image specs look up point positions without
    // rescanning the array, while still staying subscribed to point-set changes.
    const pointByKey = createMemo(
      () => new Map(props.points().map((point) => [point.key, point])),
    );
    // Device pixel ratio, re-read on resize (the only time it changes here); the
    // renderer and the point sprite both size to it.
    const pixelRatio = createMemo(() => {
      props.size();
      return window.devicePixelRatio;
    });

    // The highlight rings to show (selection / hover / family). Each font gets
    // at most one ring (selected wins), dimmed with the same active/dimmed rule
    // as the points and images when it is filtered out / weight-inactive.
    const ringSpecs = createMemo<RingSpec[]>(() => {
      const points = props.points();
      const selected = props.selectedKey();
      const hovered = props.hoveredKey();
      const family = props.selectedFamily();
      const dark = isDark();
      const pointsByKey = pointByKey();
      const predicate = makeActivePredicate(
        props.filteredKeys(),
        new Set(props.activeWeights()),
      );

      const radiusByKey = new Map<string, number>();
      if (family) {
        for (const point of points) {
          if (point.item.meta.family_name === family) {
            radiusByKey.set(point.key, RING_RADIUS_FAMILY);
          }
        }
      }
      if (hovered) radiusByKey.set(hovered, RING_RADIUS_HOVERED);
      if (selected) radiusByKey.set(selected, RING_RADIUS_SELECTED);

      const specs: RingSpec[] = [];
      for (const [key, radiusPx] of radiusByKey) {
        const point = pointsByKey.get(key);
        if (!point) continue;
        specs.push({
          x: point.x,
          y: -point.y,
          color: getClusterColor({
            k: point.item.computed?.clustering?.k,
            isDark: dark,
          }),
          radiusPx,
          opacity: predicate(point) ? 1 : DIMMED_OPACITY,
        });
      }
      return specs;
    });

    // The sample images to show. The selected font always shows its image, but
    // it still dims with its ring when filtered out / weight-inactive.
    const imageSpecs = createMemo<ImageSpec[]>(() => {
      const pointsByKey = pointByKey();
      const imageKeys = props.imageKeys();
      const selected = props.selectedKey();
      const showImages = props.showImages();
      const predicate = makeActivePredicate(
        props.filteredKeys(),
        new Set(props.activeWeights()),
      );
      const dark = isDark();

      const wanted = new Set<string>();
      if (showImages) for (const key of imageKeys) wanted.add(key);
      if (selected) wanted.add(selected);

      const specs: ImageSpec[] = [];
      for (const key of wanted) {
        const point = pointsByKey.get(key);
        if (!point || !point.item.meta.safe_name) continue;
        specs.push({
          key,
          safeName: point.item.meta.safe_name,
          x: point.x,
          y: -point.y,
          color: getClusterColor({
            k: point.item.computed?.clustering?.k,
            isDark: dark,
          }),
          opacity: predicate(point) ? 1 : DIMMED_OPACITY,
        });
      }
      return specs;
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
    const pointLayer = createPointLayer({
      points: props.points,
      isDark,
      filteredKeys: props.filteredKeys,
      activeWeights: props.activeWeights,
      pixelRatio,
      glowScale: compositor.glowScale,
      requestRender: scheduleRender,
    });
    const ringLayer = createRingLayer({
      specs: ringSpecs,
      zoom: props.zoomFactor,
      resolution: props.size,
      requestRender: scheduleRender,
    });
    const imageLayer = createImageLayer({
      specs: imageSpecs,
      sessionDirectory: props.sessionDirectory,
      zoom: props.zoomFactor,
      requestRender: scheduleRender,
    });
    scene.add(axisLayer);
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

    // --- effect: glow on/off ---------------------------------------------
    // `renderFrame` switches between the bloom and straight paths on `glow`, but
    // it reads it untracked (it runs in rAF), so subscribe here to repaint.
    createEffect(() => {
      props.glow();
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
