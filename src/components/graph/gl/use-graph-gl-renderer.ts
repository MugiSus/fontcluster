import {
  type Accessor,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js';
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  ColorManagement,
  Float32BufferAttribute,
  Group,
  LinearFilter,
  Mesh,
  NormalBlending,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  type Texture,
  TextureLoader,
  Vector2,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { convertFileSrc } from '@tauri-apps/api/core';
import { type FontWeight } from '../../../types/font';
import { type GraphPointData, type GraphViewBox } from '../types';
import {
  colorForCluster,
  readClusterColorPalette,
  type ClusterColorPalette,
} from './cluster-colors-gl';
import { imageFragmentShader, imageVertexShader } from './image-shaders';
import { pointFragmentShader, pointVertexShader } from './point-shaders';
import { ringFragmentShader, ringVertexShader } from './ring-shaders';

// Colors come straight from the CSS variables as sRGB, so disable three's
// linear<->sRGB conversion to keep the rendered hues WYSIWYG with the SVG layer.
ColorManagement.enabled = false;

const BACKDROP_COLOR = 0x000000;
const POINT_SIZE_ACTIVE = 4.5;
const POINT_SIZE_DIMMED = 3;
// Bloom/glow toggle — flip to re-enable the glow post-process.
const ENABLE_BLOOM = false;
const BLOOM_STRENGTH = 0.9;
const BLOOM_RADIUS = 0.5;
// Keep the threshold above the dark backdrop so only bright point cores bloom;
// a threshold of 0 makes the whole frame haze over.
const BLOOM_THRESHOLD = 0.2;
const MAX_PIXEL_RATIO = 2;

// Ring radii in CSS pixels, matching the SVG circle radii.
const RING_RADIUS_SELECTED = 44;
const RING_RADIUS_HOVERED = 22;
const RING_RADIUS_FAMILY = 26;

// Sample image footprint in CSS pixels, matching the SVG masked rect.
const IMAGE_WIDTH_PX = 128;
const IMAGE_HEIGHT_PX = 26;
const DIMMED_OPACITY = 0.35;

interface UseGraphGlRendererProps {
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
 * Drives the entire graph render on the GPU: a glowing point cloud, the
 * selection/hover/family rings and the cluster-tinted sample images, all
 * post-processed with bloom. It is a pure renderer of derived state — it reads
 * viewport / point / selection signals but never mutates application state.
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
    if (ENABLE_BLOOM) composer.addPass(bloomPass);

    // --- point cloud -----------------------------------------------------
    const pointGeometry = new BufferGeometry();
    const pointMaterial = new ShaderMaterial({
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
    const pointCloud = new Points(pointGeometry, pointMaterial);
    pointCloud.frustumCulled = false;
    pointCloud.renderOrder = 0;
    scene.add(pointCloud);

    // --- highlight rings -------------------------------------------------
    const ringGeometry = new BufferGeometry();
    const ringMaterial = new ShaderMaterial({
      uniforms: { uPixelRatio: { value: 1 }, uTime: { value: 0 } },
      vertexShader: ringVertexShader,
      fragmentShader: ringFragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const ringCloud = new Points(ringGeometry, ringMaterial);
    ringCloud.frustumCulled = false;
    ringCloud.renderOrder = 1;
    scene.add(ringCloud);

    // --- sample images ---------------------------------------------------
    const imageGroup = new Group();
    imageGroup.renderOrder = 2;
    scene.add(imageGroup);
    const imagePlane = new PlaneGeometry(1, 1);
    const textureLoader = new TextureLoader();
    const textureCache = new Map<string, Texture>();
    interface ImageEntry {
      mesh: Mesh;
      material: ShaderMaterial;
      aspect?: number | undefined;
    }
    const imageEntries = new Map<string, ImageEntry>();
    let lastImageZoom = 1;

    const getTextureAspect = (texture: Texture): number | undefined => {
      const image = texture.image as
        | { width?: number; height?: number }
        | undefined;
      if (image?.width && image.height) return image.width / image.height;
      return undefined;
    };

    // Fit the image inside the IMAGE_WIDTH_PX x IMAGE_HEIGHT_PX box without
    // distorting its aspect ratio (the SVG `xMidYMid meet` behaviour).
    const applyImageScale = (entry: ImageEntry, zoom: number) => {
      let width = IMAGE_WIDTH_PX;
      let height = IMAGE_HEIGHT_PX;
      const aspect = entry.aspect;
      if (aspect && Number.isFinite(aspect) && aspect > 0) {
        const boxAspect = IMAGE_WIDTH_PX / IMAGE_HEIGHT_PX;
        if (aspect > boxAspect) {
          height = IMAGE_WIDTH_PX / aspect;
        } else {
          width = IMAGE_HEIGHT_PX * aspect;
        }
      }
      entry.mesh.scale.set(width * zoom, height * zoom, 1);
    };

    // --- shared point lookup (rebuilt with the geometry) -----------------
    let pointByKey = new Map<string, GraphPointData>();

    // --- color palette (theme aware via a version signal) ----------------
    let palette: ClusterColorPalette = readClusterColorPalette();
    const [colorVersion, setColorVersion] = createSignal(0);
    const themeObserver = new MutationObserver(() => {
      palette = readClusterColorPalette();
      setColorVersion((version) => version + 1);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    const isActivePoint = (
      point: GraphPointData,
      filtered: Set<string>,
      activeWeights: Set<FontWeight>,
    ) =>
      filtered.has(point.key) &&
      activeWeights.has(point.item.meta.weight as FontWeight);

    // --- render scheduling (continuous while rings animate) --------------
    let rafId: number | undefined;
    let animating = false;
    const renderFrame = () => {
      rafId = undefined;
      if (animating) {
        ringMaterial.uniforms['uTime']!.value = performance.now() / 1000;
        composer.render();
        rafId = window.requestAnimationFrame(renderFrame);
        return;
      }
      composer.render();
    };
    const scheduleRender = () => {
      if (rafId !== undefined) return;
      rafId = window.requestAnimationFrame(renderFrame);
    };
    const setAnimating = (value: boolean) => {
      if (value === animating) return;
      animating = value;
      if (value) scheduleRender();
    };

    // --- point geometry (rebuilt when the point set / theme changes) -----
    createEffect(() => {
      const points = props.points();
      colorVersion();
      const count = points.length;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const states = new Float32Array(count);
      const lookup = new Map<string, GraphPointData>();

      for (let index = 0; index < count; index += 1) {
        const point = points[index]!;
        positions[index * 3] = point.x;
        // Graph space is y-down; negate so the world is y-up for a standard camera.
        positions[index * 3 + 1] = -point.y;
        positions[index * 3 + 2] = 0;
        const [r, g, b] = colorForCluster(
          palette,
          point.item.computed?.clustering?.k,
        );
        colors[index * 3] = r;
        colors[index * 3 + 1] = g;
        colors[index * 3 + 2] = b;
        lookup.set(point.key, point);
      }

      pointByKey = lookup;
      pointGeometry.setAttribute(
        'position',
        new Float32BufferAttribute(positions, 3),
      );
      pointGeometry.setAttribute(
        'aColor',
        new Float32BufferAttribute(colors, 3),
      );
      pointGeometry.setAttribute(
        'aState',
        new Float32BufferAttribute(states, 1),
      );
      pointGeometry.setDrawRange(0, count);
      scheduleRender();
    });

    // --- point active/dimmed state (filter + active weights) -------------
    createEffect(() => {
      const points = props.points();
      const filtered = props.filteredKeys();
      const activeWeights = new Set(props.activeWeights());
      const attribute = pointGeometry.getAttribute('aState');
      if (!attribute || attribute.count !== points.length) return;

      const states = attribute.array as Float32Array;
      for (let index = 0; index < points.length; index += 1) {
        states[index] = isActivePoint(points[index]!, filtered, activeWeights)
          ? 0
          : 1;
      }
      attribute.needsUpdate = true;
      scheduleRender();
    });

    // --- highlight rings (selection / hover / family) --------------------
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

      const positions: number[] = [];
      const colors: number[] = [];
      const radii: number[] = [];
      for (const [key, radius] of radiusByKey) {
        const point = pointByKey.get(key);
        if (!point) continue;
        const [r, g, b] = colorForCluster(
          palette,
          point.item.computed?.clustering?.k,
        );
        positions.push(point.x, -point.y, 1);
        colors.push(r, g, b);
        radii.push(radius);
      }

      ringGeometry.setAttribute(
        'position',
        new Float32BufferAttribute(positions, 3),
      );
      ringGeometry.setAttribute(
        'aColor',
        new Float32BufferAttribute(colors, 3),
      );
      ringGeometry.setAttribute(
        'aRadiusPx',
        new Float32BufferAttribute(radii, 1),
      );
      ringGeometry.setDrawRange(0, radii.length);
      setAnimating(radii.length > 0);
      scheduleRender();
    });

    // --- sample images (cluster-tinted, masked quads) --------------------
    createEffect(() => {
      const imageKeys = props.imageKeys();
      const selected = props.selectedKey();
      const showImages = props.showImages();
      const directory = props.sessionDirectory();
      const zoom = props.zoomFactor();
      const filtered = props.filteredKeys();
      const activeWeights = new Set(props.activeWeights());
      colorVersion();

      // The selected font always shows its image; otherwise honour the toggle.
      const desired = new Set<string>();
      if (showImages) for (const key of imageKeys) desired.add(key);
      if (selected) desired.add(selected);

      for (const [key, entry] of imageEntries) {
        if (desired.has(key)) continue;
        imageGroup.remove(entry.mesh);
        entry.material.dispose();
        imageEntries.delete(key);
      }

      for (const key of desired) {
        const point = pointByKey.get(key);
        if (!point || !directory || !point.item.meta.safe_name) continue;

        let entry = imageEntries.get(key);
        if (!entry) {
          const material = new ShaderMaterial({
            uniforms: {
              uMap: { value: null },
              uColor: { value: new Color() },
              uOpacity: { value: 1 },
            },
            vertexShader: imageVertexShader,
            fragmentShader: imageFragmentShader,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: NormalBlending,
          });
          const mesh = new Mesh(imagePlane, material);
          mesh.frustumCulled = false;
          mesh.renderOrder = 2;
          imageGroup.add(mesh);
          entry = { mesh, material };
          imageEntries.set(key, entry);

          const safeName = point.item.meta.safe_name;
          const cached = textureCache.get(safeName);
          if (cached) {
            material.uniforms['uMap']!.value = cached;
            entry.aspect = getTextureAspect(cached);
          } else {
            const loadingEntry = entry;
            const url = convertFileSrc(
              `${directory}/samples/${safeName}/sample.png`,
            );
            textureLoader.load(url, (texture) => {
              texture.minFilter = LinearFilter;
              texture.magFilter = LinearFilter;
              texture.generateMipmaps = false;
              textureCache.set(safeName, texture);
              material.uniforms['uMap']!.value = texture;
              loadingEntry.aspect = getTextureAspect(texture);
              applyImageScale(loadingEntry, lastImageZoom);
              scheduleRender();
            });
          }
        }

        const [r, g, b] = colorForCluster(
          palette,
          point.item.computed?.clustering?.k,
        );
        (entry.material.uniforms['uColor']!.value as Color).setRGB(r, g, b);
        const active = isActivePoint(point, filtered, activeWeights);
        entry.material.uniforms['uOpacity']!.value =
          active || key === selected ? 1 : DIMMED_OPACITY;
        entry.mesh.position.set(point.x, -point.y, 2);
        applyImageScale(entry, zoom);
      }

      lastImageZoom = zoom;
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
      pointMaterial.uniforms['uPixelRatio']!.value = pixelRatio;
      ringMaterial.uniforms['uPixelRatio']!.value = pixelRatio;
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
      // World Y is the negated graph Y, so the camera is a standard y-up ortho.
      camera.top = -centerY + visibleHeight / 2;
      camera.bottom = -centerY - visibleHeight / 2;
      camera.updateProjectionMatrix();
      scheduleRender();
    });

    onCleanup(() => {
      if (rafId !== undefined) window.cancelAnimationFrame(rafId);
      themeObserver.disconnect();
      for (const entry of imageEntries.values()) entry.material.dispose();
      imageEntries.clear();
      for (const texture of textureCache.values()) texture.dispose();
      textureCache.clear();
      imagePlane.dispose();
      pointGeometry.dispose();
      pointMaterial.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
      bloomPass.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    });
  });
}
