import { type Accessor, createEffect, onCleanup, onMount } from 'solid-js';
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  ColorManagement,
  Float32BufferAttribute,
  OrthographicCamera,
  Points,
  Scene,
  ShaderMaterial,
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
  type ClusterColorPalette,
} from './cluster-colors-gl';
import { pointFragmentShader, pointVertexShader } from './point-shaders';

// Colors come straight from the CSS variables as sRGB, so disable three's
// linear<->sRGB conversion to keep the rendered hues WYSIWYG with the SVG layer.
ColorManagement.enabled = false;

const BACKDROP_COLOR = 0x0a0a0c;
const POINT_SIZE_ACTIVE = 4.5;
const POINT_SIZE_DIMMED = 3;
const BLOOM_STRENGTH = 0.9;
const BLOOM_RADIUS = 0.5;
const BLOOM_THRESHOLD = 0;
const MAX_PIXEL_RATIO = 2;

interface UseGraphGlRendererProps {
  getCanvas: () => HTMLCanvasElement | undefined;
  size: Accessor<{ width: number; height: number }>;
  viewBox: Accessor<GraphViewBox>;
  points: Accessor<GraphPointData[]>;
  filteredKeys: Accessor<Set<string>>;
  activeWeights: Accessor<FontWeight[]>;
}

/**
 * Drives a Three.js point cloud that renders the graph nodes on the GPU with a
 * bloom/glow pass. It is a pure renderer of derived state: it reads viewport,
 * point and selection-adjacent signals but never mutates application state.
 */
export function useGraphGlRenderer(props: UseGraphGlRendererProps) {
  onMount(() => {
    const canvas = props.getCanvas();
    if (!canvas) return;

    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setClearColor(new Color(BACKDROP_COLOR), 1);

    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    camera.position.z = 10;

    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
      new Vector2(1, 1),
      BLOOM_STRENGTH,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD,
    );
    composer.addPass(renderPass);
    composer.addPass(bloomPass);

    const geometry = new BufferGeometry();
    const material = new ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: 1 },
        uSizeActive: { value: POINT_SIZE_ACTIVE },
        uSizeDimmed: { value: POINT_SIZE_DIMMED },
      },
      vertexShader: pointVertexShader,
      fragmentShader: pointFragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const pointCloud = new Points(geometry, material);
    pointCloud.frustumCulled = false;
    scene.add(pointCloud);

    // --- on-demand render scheduling -------------------------------------
    let rafId: number | undefined;
    let needsRender = false;
    const renderFrame = () => {
      rafId = undefined;
      if (!needsRender) return;
      needsRender = false;
      composer.render();
    };
    const scheduleRender = () => {
      needsRender = true;
      if (rafId !== undefined) return;
      rafId = window.requestAnimationFrame(renderFrame);
    };

    // --- color palette (theme aware) -------------------------------------
    let palette: ClusterColorPalette = readClusterColorPalette();
    const repaintColors = () => {
      const attribute = geometry.getAttribute('aColor');
      if (!attribute) return;
      const colors = attribute.array as Float32Array;
      const points = props.points();
      for (let index = 0; index < points.length; index += 1) {
        const [r, g, b] = colorForCluster(
          palette,
          points[index]!.item.computed?.clustering?.k,
        );
        colors[index * 3] = r;
        colors[index * 3 + 1] = g;
        colors[index * 3 + 2] = b;
      }
      attribute.needsUpdate = true;
      scheduleRender();
    };
    const themeObserver = new MutationObserver(() => {
      palette = readClusterColorPalette();
      repaintColors();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    // --- geometry (rebuilt only when the point set changes) ---------------
    createEffect(() => {
      const points = props.points();
      const count = points.length;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const states = new Float32Array(count);

      for (let index = 0; index < count; index += 1) {
        const point = points[index]!;
        positions[index * 3] = point.x;
        positions[index * 3 + 1] = point.y;
        positions[index * 3 + 2] = 0;
        const [r, g, b] = colorForCluster(
          palette,
          point.item.computed?.clustering?.k,
        );
        colors[index * 3] = r;
        colors[index * 3 + 1] = g;
        colors[index * 3 + 2] = b;
      }

      geometry.setAttribute(
        'position',
        new Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute('aColor', new Float32BufferAttribute(colors, 3));
      geometry.setAttribute('aState', new Float32BufferAttribute(states, 1));
      geometry.setDrawRange(0, count);
      scheduleRender();
    });

    // --- per-point active/dimmed state (filter + active weights) ----------
    createEffect(() => {
      const points = props.points();
      const filtered = props.filteredKeys();
      const activeWeights = new Set(props.activeWeights());
      const attribute = geometry.getAttribute('aState');
      if (!attribute || attribute.count !== points.length) return;

      const states = attribute.array as Float32Array;
      for (let index = 0; index < points.length; index += 1) {
        const point = points[index]!;
        const isActive =
          filtered.has(point.key) &&
          activeWeights.has(point.item.meta.weight as FontWeight);
        states[index] = isActive ? 0 : 1;
      }
      attribute.needsUpdate = true;
      scheduleRender();
    });

    // --- renderer / composer sizing --------------------------------------
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
      material.uniforms['uPixelRatio']!.value = pixelRatio;
      scheduleRender();
    });

    // --- camera sync (matches SVG `preserveAspectRatio="xMidYMid meet"`) --
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
      const scale = Math.min(width / viewBox.width, height / viewBox.height);
      const visibleWidth = width / scale;
      const visibleHeight = height / scale;
      const centerX = viewBox.x + viewBox.width / 2;
      const centerY = viewBox.y + viewBox.height / 2;

      camera.left = centerX - visibleWidth / 2;
      camera.right = centerX + visibleWidth / 2;
      // y grows downward in graph space, so the smaller y is the top edge.
      camera.top = centerY - visibleHeight / 2;
      camera.bottom = centerY + visibleHeight / 2;
      camera.updateProjectionMatrix();
      scheduleRender();
    });

    onCleanup(() => {
      if (rafId !== undefined) window.cancelAnimationFrame(rafId);
      themeObserver.disconnect();
      geometry.dispose();
      material.dispose();
      bloomPass.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    });
  });
}
