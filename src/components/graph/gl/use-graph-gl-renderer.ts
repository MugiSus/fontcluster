import {
  type Accessor,
  createEffect,
  onCleanup,
  onMount,
  untrack,
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
const DIMMED_OPACITY = 0.35;

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
 * Responsibilities are split across three composable layers — see
 * {@link createPointLayer}, {@link createRingLayer} and {@link createImageLayer}.
 * Everything is drawn in a single scene rendered directly (no post-processing):
 * the glow lives in the point sprite itself, so the background stays exactly the
 * theme color. This hook owns the renderer, scene, camera and the on-demand
 * render loop, and wires Solid signals to the layers via fine-grained effects.
 * It is a pure renderer of derived state — it never mutates application state.
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

      // The glow's overlapping halos band on an 8-bit screen (additively in dark
      // mode, multiplicatively in light mode), so whenever it is on we route it
      // through the bloom pipeline. Glow off renders straight to the screen.
      const dark = isDark();
      if (!props.glow()) {
        pointLayer.setPass('combined');
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }

      const pixelRatio = window.devicePixelRatio;

      // 1) Sharp pass: cores + rings + images + axes, full-res to the screen.
      pointLayer.setPass('core');
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);

      // 2) Glow pass: halos only, into the low-res half-float buffer. Cleared to
      //    transparent black: the premultiplied halos accumulate from zero for
      //    both operators (sum for dark additive, 'over' for light). Scale the
      //    sprite pixel size to the buffer's lower resolution so the glow lands
      //    at the same on-screen size; hide the sharp-only layers.
      pointLayer.setPass('halo');
      pointLayer.setPixelRatio(pixelRatio * compositor.glowScale);
      axisLayer.object.visible = false;
      ringLayer.object.visible = false;
      imageLayer.object.visible = false;
      renderer.setRenderTarget(compositor.target);
      renderer.setClearColor(0x000000, 0);
      renderer.render(scene, camera);

      // Restore the shared state the next sharp pass / frame expects.
      renderer.setClearColor(getBackgroundColor({ isDark: dark }), 1);
      pointLayer.setPixelRatio(pixelRatio);
      axisLayer.object.visible = true;
      ringLayer.object.visible = true;
      imageLayer.object.visible = true;

      // 3) Composite the upsampled glow over the sharp screen — additive for the
      //    dark glow (adds light), premultiplied 'over' for the light glow.
      renderer.setRenderTarget(null);
      compositor.composite(renderer, dark);
    };
    const scheduleRender = () => {
      if (rafId !== undefined) return;
      rafId = window.requestAnimationFrame(renderFrame);
    };

    // --- layers (one scene; render order keeps images over rings over dots) -
    const axisLayer = createAxisLayer();
    const pointLayer = createPointLayer();
    const ringLayer = createRingLayer();
    const imageLayer = createImageLayer(scheduleRender);
    const compositor = createGlowCompositor();
    scene.add(axisLayer.object);
    scene.add(pointLayer.object);
    scene.add(ringLayer.object);
    scene.add(imageLayer.object);

    // --- shared derived state --------------------------------------------
    // `pointByKey` lets the ring/image effects look up point positions without
    // rescanning the array; it is cleared and repopulated in place. `isDark` is
    // a reactive read of the color-mode hook used by every color-bearing effect.
    const pointByKey = new Map<string, GraphPointData>();
    const isDark = () => colorMode() === 'dark';

    // --- effect: theme (light vs. dark) ----------------------------------
    // The clear color is the theme background; the point layer flips between
    // additive glow (dark) and normal-blended halos (light).
    createEffect(() => {
      const dark = isDark();
      renderer.setClearColor(getBackgroundColor({ isDark: dark }), 1);
      pointLayer.setLightMode(!dark);
      axisLayer.setTheme(!dark);
      scheduleRender();
    });

    // --- effect: point geometry (point set changed) ----------------------
    // setPoints reallocates the color/state buffers to zero, so we re-apply both
    // right here from the *same* points array — otherwise a rebuilt buffer can be
    // left at the zero (black) default if the dedicated effects below don't run
    // in this same flush (e.g. across a session switch). Theme / filter are read
    // untracked so this effect still only re-runs on a point-set change; the
    // effects below own those (and re-run when clustering / theme / filter move).
    createEffect(() => {
      const points = props.points();
      pointByKey.clear();
      for (const point of points) pointByKey.set(point.key, point);
      pointLayer.setPoints(points);
      untrack(() => {
        pointLayer.setColors(points, isDark());
        pointLayer.setActiveState(
          points,
          makeActivePredicate(
            props.filteredKeys(),
            new Set(props.activeWeights()),
          ),
        );
      });
      scheduleRender();
    });

    // --- effect: point colors (theme / clustering changed) ---------------
    // The geometry effect already seeds colors on a point-set change; this keeps
    // them current when the theme flips or clustering loads in later (setColors
    // reads each point's clustering, so this re-runs when that arrives).
    createEffect(() => {
      pointLayer.setColors(props.points(), isDark());
      scheduleRender();
    });

    // --- effect: glow on/off ---------------------------------------------
    // Glow on is what enables the bloom pipeline in renderFrame (both themes —
    // the overlapping halos band on an 8-bit screen either way).
    createEffect(() => {
      pointLayer.setGlow(props.glow());
      scheduleRender();
    });

    // --- effect: point active/dimmed state (filter / active weights) -----
    createEffect(() => {
      const points = props.points();
      const predicate = makeActivePredicate(
        props.filteredKeys(),
        new Set(props.activeWeights()),
      );
      pointLayer.setActiveState(points, predicate);
      scheduleRender();
    });

    // --- effect: highlight rings (selection / hover / family) ------------
    createEffect(() => {
      const points = props.points();
      const selected = props.selectedKey();
      const hovered = props.hoveredKey();
      const family = props.selectedFamily();
      const dark = isDark();

      // Dedupe per key, keeping the strongest affordance (selected wins).
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
        const point = pointByKey.get(key);
        if (!point) continue;
        specs.push({
          x: point.x,
          y: -point.y,
          color: getClusterColor({
            k: point.item.computed?.clustering?.k,
            isDark: dark,
          }),
          radiusPx,
        });
      }
      ringLayer.setRings(specs);
      scheduleRender();
    });

    // --- effect: sample images -------------------------------------------
    createEffect(() => {
      const imageKeys = props.imageKeys();
      const selected = props.selectedKey();
      const showImages = props.showImages();
      const sessionDirectory = props.sessionDirectory();
      const predicate = makeActivePredicate(
        props.filteredKeys(),
        new Set(props.activeWeights()),
      );
      const dark = isDark();

      // The selected font always shows its image; otherwise honour the toggle.
      const wanted = new Set<string>();
      if (showImages) for (const key of imageKeys) wanted.add(key);
      if (selected) wanted.add(selected);

      const specs: ImageSpec[] = [];
      for (const key of wanted) {
        const point = pointByKey.get(key);
        if (!point || !point.item.meta.safe_name) continue;
        const active = predicate(point) || key === selected;
        specs.push({
          key,
          safeName: point.item.meta.safe_name,
          x: point.x,
          y: -point.y,
          color: getClusterColor({
            k: point.item.computed?.clustering?.k,
            isDark: dark,
          }),
          opacity: active ? 1 : DIMMED_OPACITY,
        });
      }
      imageLayer.update(specs, sessionDirectory);
      scheduleRender();
    });

    // --- effect: origin crosshair position -------------------------------
    createEffect(() => {
      const origin = props.origin();
      axisLayer.setOrigin(origin.x, origin.y);
      scheduleRender();
    });

    // --- effect: zoom (keeps ring/image sizes constant in CSS pixels) ----
    createEffect(() => {
      const zoom = props.zoomFactor();
      ringLayer.setZoom(zoom);
      imageLayer.setZoom(zoom);
      scheduleRender();
    });

    // --- effect: renderer sizing -----------------------------------------
    const drawingBufferSize = new Vector2();
    createEffect(() => {
      const { width, height } = props.size();
      if (width <= 0 || height <= 0) return;
      const pixelRatio = window.devicePixelRatio;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      // Size the glow buffer from the actual drawing-buffer resolution
      // (getDrawingBufferSize already folds in pixelRatio); the compositor then
      // applies its own GLOW_SCALE.
      renderer.getDrawingBufferSize(drawingBufferSize);
      compositor.setSize(drawingBufferSize.x, drawingBufferSize.y);
      pointLayer.setPixelRatio(pixelRatio);
      ringLayer.setResolution(width, height);
      axisLayer.setResolution(width, height);
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
      axisLayer.dispose();
      pointLayer.dispose();
      ringLayer.dispose();
      imageLayer.dispose();
      compositor.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    });
  });
}
