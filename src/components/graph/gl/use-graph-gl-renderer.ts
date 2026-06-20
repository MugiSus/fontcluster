import {
  type Accessor,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js';
import {
  Color,
  ColorManagement,
  OrthographicCamera,
  Scene,
  Vector2,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { type FontWeight } from '../../../types/font';
import { type GraphPointData, type GraphViewBox } from '../types';
import {
  colorForCluster,
  readClusterColorPalette,
  readThemeBackground,
  type ClusterColorPalette,
} from './cluster-colors-gl';
import { createImageLayer, type ImageSpec } from './image-layer';
import { createPointLayer, makeActivePredicate } from './point-layer';
import { createRingLayer, type RingSpec } from './ring-layer';

// Colors come straight from the CSS variables as sRGB, so disable three's
// linear<->sRGB conversion to keep the rendered hues WYSIWYG with the CSS theme.
ColorManagement.enabled = false;

// Bloom (glow) tuning.
// - threshold sits above the dark backdrop so only bright point cores bloom.
// - a small radius keeps the glow tight around points; a large radius smears it
//   into a full-frame haze that visibly lifts the background color.
const BLOOM_STRENGTH = 1.0;
const BLOOM_RADIUS = 0.15;
const BLOOM_THRESHOLD = 0.2;

// Highlight ring radii in CSS pixels (stroke width is constant; see RingLayer).
const RING_RADIUS_SELECTED = 30;
const RING_RADIUS_HOVERED = 16;
const RING_RADIUS_FAMILY = 20;

/** Opacity of dimmed (filtered-out / inactive weight) sample images. */
const DIMMED_OPACITY = 0.35;
/** Cap the device pixel ratio so bloom stays affordable on HiDPI displays. */
const MAX_PIXEL_RATIO = 2;

export interface UseGraphGlRendererProps {
  getCanvas: () => HTMLCanvasElement | undefined;
  size: Accessor<{ width: number; height: number }>;
  viewBox: Accessor<GraphViewBox>;
  zoomFactor: Accessor<number>;
  points: Accessor<GraphPointData[]>;
  filteredKeys: Accessor<Set<string>>;
  activeWeights: Accessor<FontWeight[]>;
  selectedKey: Accessor<string | null>;
  hoveredKey: Accessor<string | null>;
  selectedFamily: Accessor<string | null>;
  imageKeys: Accessor<Set<string>>;
  showImages: Accessor<boolean>;
  sessionDirectory: Accessor<string>;
}

/**
 * Orchestrates the GPU graph renderer.
 *
 * Responsibilities are split across three composable layers — see
 * {@link createPointLayer}, {@link createRingLayer} and {@link createImageLayer}.
 * This hook owns the renderer, the two scenes (bloomed points vs. crisp
 * overlay), the camera, the bloom composer and the on-demand render loop, and
 * wires Solid signals to the layers via fine-grained effects. It is a pure
 * renderer of derived state — it never mutates application state.
 */
export function useGraphGlRenderer(props: UseGraphGlRendererProps) {
  onMount(() => {
    const canvas = props.getCanvas();
    if (!canvas) return;

    // --- core: renderer, scenes, camera, bloom composer ------------------
    // `scene` is post-processed with bloom (points); `overlayScene` is drawn
    // crisply on top afterwards (rings + images), so highlights stay sharp.
    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    const scene = new Scene();
    const overlayScene = new Scene();

    // Orthographic, y-up: world Y is the negated graph Y (graph space is
    // y-down), so a standard camera maps it the right way up.
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    camera.position.z = 10;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(
      new Vector2(1, 1),
      BLOOM_STRENGTH,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD,
    );
    composer.addPass(bloomPass);

    // --- on-demand render loop -------------------------------------------
    // Nothing animates continuously, so we render a single frame whenever a
    // reactive dependency or an async texture asks for one.
    let rafId: number | undefined;
    const renderFrame = () => {
      rafId = undefined;
      composer.render();
      // Draw the crisp overlay over the post-processed result.
      renderer.setRenderTarget(null);
      renderer.autoClear = false;
      renderer.render(overlayScene, camera);
      renderer.autoClear = true;
    };
    const scheduleRender = () => {
      if (rafId !== undefined) return;
      rafId = window.requestAnimationFrame(renderFrame);
    };

    // --- layers ----------------------------------------------------------
    const pointLayer = createPointLayer();
    const ringLayer = createRingLayer();
    const imageLayer = createImageLayer(scheduleRender);
    scene.add(pointLayer.object);
    overlayScene.add(ringLayer.object);
    overlayScene.add(imageLayer.object);

    // --- shared derived state --------------------------------------------
    // Palette is refreshed on theme change; `pointByKey` lets the ring/image
    // effects look up point positions without rescanning the array.
    let palette: ClusterColorPalette = readClusterColorPalette();
    let pointByKey = new Map<string, GraphPointData>();

    // A version signal lets effects re-run when the theme palette changes
    // without threading the palette object through every dependency.
    const [colorVersion, setColorVersion] = createSignal(0);

    // --- theme: light vs. dark -------------------------------------------
    // Dark: additive glow + bloom on the dark backdrop.
    // Light: subtractive ink (the point layer multiplies) with bloom off.
    // The clear color is resolved from the CSS theme so the canvas matches the
    // surrounding panel exactly (no brighter/darker seam).
    const applyTheme = () => {
      const background = readThemeBackground();
      renderer.setClearColor(
        new Color(background.rgb[0], background.rgb[1], background.rgb[2]),
        1,
      );
      pointLayer.setLightMode(background.isLight);
      bloomPass.enabled = !background.isLight;
      scheduleRender();
    };
    const themeObserver = new MutationObserver(() => {
      palette = readClusterColorPalette();
      setColorVersion((version) => version + 1);
      applyTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-kb-theme', 'style'],
    });
    applyTheme();

    // --- effect: point geometry (point set or theme changed) -------------
    createEffect(() => {
      const points = props.points();
      colorVersion();
      pointByKey = new Map(points.map((point) => [point.key, point]));
      pointLayer.setPoints(points, palette);
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
      colorVersion();

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
          color: colorForCluster(palette, point.item.computed?.clustering?.k),
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
      colorVersion();

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
          color: colorForCluster(palette, point.item.computed?.clustering?.k),
          opacity: active ? 1 : DIMMED_OPACITY,
        });
      }
      imageLayer.update(specs, sessionDirectory);
      scheduleRender();
    });

    // --- effect: zoom (keeps ring/image sizes constant in CSS pixels) ----
    createEffect(() => {
      const zoom = props.zoomFactor();
      ringLayer.setZoom(zoom);
      imageLayer.setZoom(zoom);
      scheduleRender();
    });

    // --- effect: renderer / composer sizing ------------------------------
    createEffect(() => {
      const { width, height } = props.size();
      if (width <= 0 || height <= 0) return;
      const pixelRatio = Math.min(
        window.devicePixelRatio || 1,
        MAX_PIXEL_RATIO,
      );
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      bloomPass.setSize(width, height);
      pointLayer.setPixelRatio(pixelRatio);
      ringLayer.setResolution(width, height);
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
      themeObserver.disconnect();
      pointLayer.dispose();
      ringLayer.dispose();
      imageLayer.dispose();
      bloomPass.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    });
  });
}
