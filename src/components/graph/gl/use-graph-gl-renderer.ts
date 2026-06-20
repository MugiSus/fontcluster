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
  MultiplyBlending,
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
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { convertFileSrc } from '@tauri-apps/api/core';
import { type FontWeight } from '../../../types/font';
import { type GraphPointData, type GraphViewBox } from '../types';
import {
  colorForCluster,
  readBackgroundColor,
  readClusterColorPalette,
  type ClusterColorPalette,
} from './cluster-colors-gl';
import { imageFragmentShader, imageVertexShader } from './image-shaders';
import { pointFragmentShader, pointVertexShader } from './point-shaders';

// Colors come straight from the CSS variables as sRGB, so disable three's
// linear<->sRGB conversion to keep the rendered hues WYSIWYG with the SVG layer.
ColorManagement.enabled = false;

const BACKDROP_COLOR = 0x000000;
const POINT_SIZE_ACTIVE = 4.5;
const POINT_SIZE_DIMMED = 3;
// Bloom/glow toggle — applies to points and rings only (images stay crisp).
const ENABLE_BLOOM = true;
const BLOOM_STRENGTH = 0.9;
const BLOOM_RADIUS = 0.5;
// Keep the threshold above the dark backdrop so only bright point cores bloom;
// a threshold of 0 makes the whole frame haze over.
const BLOOM_THRESHOLD = 0.2;
const MAX_PIXEL_RATIO = 2;

// Ring radii in CSS pixels. The stroke width is constant regardless of radius.
const RING_RADIUS_SELECTED = 30;
const RING_RADIUS_HOVERED = 16;
const RING_RADIUS_FAMILY = 20;
const RING_LINE_WIDTH_PX = 1;
const RING_SEGMENTS = 64;

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

    // `scene` holds the bloomed content (points + rings); `overlayScene` holds
    // the sample images, drawn crisply on top of the post-processed result.
    const scene = new Scene();
    const overlayScene = new Scene();
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
        uLightMode: { value: 0 },
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

    // --- highlight rings (crisp Line2 circles, kept out of the bloom) -----
    // A shared unit circle (radius 1); each ring scales it to its pixel radius.
    // Line2 keeps a constant pixel stroke width independent of that scale.
    const ringCircleGeometry = new LineGeometry();
    {
      const circlePositions: number[] = [];
      for (let segment = 0; segment <= RING_SEGMENTS; segment += 1) {
        const angle = (segment / RING_SEGMENTS) * Math.PI * 2;
        circlePositions.push(Math.cos(angle), Math.sin(angle), 0);
      }
      ringCircleGeometry.setPositions(circlePositions);
    }
    const ringGroup = new Group();
    ringGroup.renderOrder = 1;
    overlayScene.add(ringGroup);
    interface RingEntry {
      line: Line2;
      material: LineMaterial;
      radiusPx: number;
    }
    const ringPool: RingEntry[] = [];
    let activeRingCount = 0;
    let lastRingZoom = 1;
    let lastViewWidth = 1;
    let lastViewHeight = 1;

    const getRingEntry = (index: number): RingEntry => {
      const existing = ringPool[index];
      if (existing) return existing;
      const material = new LineMaterial({
        color: 0xffffff,
        linewidth: RING_LINE_WIDTH_PX,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      });
      material.resolution.set(lastViewWidth, lastViewHeight);
      const line = new Line2(ringCircleGeometry, material);
      line.frustumCulled = false;
      line.visible = false;
      ringGroup.add(line);
      const entry: RingEntry = { line, material, radiusPx: 0 };
      ringPool[index] = entry;
      return entry;
    };

    // --- sample images ---------------------------------------------------
    const imageGroup = new Group();
    imageGroup.renderOrder = 2;
    overlayScene.add(imageGroup);
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
      applyTheme();
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

    // --- render scheduling (on demand) -----------------------------------
    let rafId: number | undefined;
    const renderFrame = () => {
      rafId = undefined;
      // Bloomed content first, then the crisp (un-bloomed) overlay on top.
      composer.render();
      renderer.setRenderTarget(null);
      renderer.autoClear = false;
      renderer.render(overlayScene, camera);
      renderer.autoClear = true;
    };
    const scheduleRender = () => {
      if (rafId !== undefined) return;
      rafId = window.requestAnimationFrame(renderFrame);
    };

    // Match the renderer to the theme: dark = additive glow + bloom, light =
    // subtractive ink (MultiplyBlending) with bloom off, on the panel's own bg.
    const applyTheme = () => {
      const background = readBackgroundColor();
      renderer.setClearColor(
        new Color(background.rgb[0], background.rgb[1], background.rgb[2]),
        1,
      );
      pointMaterial.blending = background.isLight
        ? MultiplyBlending
        : AdditiveBlending;
      pointMaterial.needsUpdate = true;
      pointMaterial.uniforms['uLightMode']!.value = background.isLight ? 1 : 0;
      bloomPass.enabled = ENABLE_BLOOM && !background.isLight;
      scheduleRender();
    };
    applyTheme();

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

      let index = 0;
      for (const [key, radiusPx] of radiusByKey) {
        const point = pointByKey.get(key);
        if (!point) continue;
        const entry = getRingEntry(index);
        const [r, g, b] = colorForCluster(
          palette,
          point.item.computed?.clustering?.k,
        );
        entry.material.color.setRGB(r, g, b);
        entry.radiusPx = radiusPx;
        entry.line.position.set(point.x, -point.y, 1);
        entry.line.scale.set(
          radiusPx * lastRingZoom,
          radiusPx * lastRingZoom,
          1,
        );
        entry.line.visible = true;
        index += 1;
      }
      for (let i = index; i < ringPool.length; i += 1) {
        ringPool[i]!.line.visible = false;
      }
      activeRingCount = index;
      scheduleRender();
    });

    // --- rescale rings to keep a constant pixel radius on zoom ------------
    createEffect(() => {
      const zoom = props.zoomFactor();
      lastRingZoom = zoom;
      for (let i = 0; i < activeRingCount; i += 1) {
        const entry = ringPool[i]!;
        entry.line.scale.set(entry.radiusPx * zoom, entry.radiusPx * zoom, 1);
      }
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
      // LineMaterial needs the viewport resolution to size its pixel stroke.
      lastViewWidth = width;
      lastViewHeight = height;
      for (const entry of ringPool)
        entry.material.resolution.set(width, height);
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
      for (const entry of ringPool) entry.material.dispose();
      ringCircleGeometry.dispose();
      bloomPass.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    });
  });
}
