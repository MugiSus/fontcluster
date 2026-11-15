import { LRUCache } from 'lru-cache';
import { type Accessor, createEffect, onCleanup } from 'solid-js';
import {
  Color,
  Group,
  LinearFilter,
  Mesh,
  NormalBlending,
  type Object3D,
  PlaneGeometry,
  ShaderMaterial,
  type Texture,
  TextureLoader,
} from 'three';
import {
  SAMPLE_IMAGE_BOX_HEIGHT_PX,
  SAMPLE_IMAGE_BOX_WIDTH_PX,
} from '@/components/graph/constants';
import { imageFragmentShader, imageVertexShader } from './shaders/image';

/** One sample image to draw, centered (in world space) on its point. */
export interface ImageSpec {
  /** Stable font key, used to pool meshes across updates. */
  key: string;
  /** Sample folder name, used to build the texture URL. */
  safeName: string;
  x: number;
  y: number;
  /** Cluster tint applied to the (luminance-masked) sample. */
  color: Color;
  /** 1 for active points, lower for dimmed ones. */
  opacity: number;
  anchorX?: 'left' | 'center' | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

/**
 * The cluster-tinted sample images.
 *
 * Each image is a quad textured with the font's `sample.png`, tinted by its
 * cluster color and masked by the sample's luminance (see image-shaders). The
 * quad is fit inside a fixed CSS-pixel box without distorting the texture's
 * aspect ratio (the SVG `xMidYMid meet` behaviour).
 *
 * Meshes are pooled by font key, and textures are cached by URL with an LRU limit so
 * revisiting a font does not reload it. The shown set, image-source identity
 * and zoom all follow their accessors via effects; `requestRender` repaints
 * once an async texture arrives (and after each reactive update).
 */
export interface ImageLayerProps {
  /** The images to show; meshes are pooled by `spec.key` across updates. */
  specs: Accessor<ImageSpec[]>;
  /** Image-source identity for pooled meshes / textures (drops all on change). */
  sessionKey: Accessor<string>;
  /** Resolves a sample folder name to a URL loadable by three.js. */
  sampleImageUrl: (safeName: string) => string | undefined;
  /** World-units-per-CSS-pixel factor so the box stays constant on zoom. */
  zoom: Accessor<number>;
  /** Schedules a repaint of the (on-demand) render loop. */
  requestRender: () => void;
  onLayout?:
    | ((key: string, width: number, height: number, ready: boolean) => void)
    | undefined;
}

interface ImageEntry {
  key: string;
  x: number;
  isLeftAligned: boolean;
  url: string;
  width: number;
  height: number;
  mesh: Mesh;
  material: ShaderMaterial;
  /** Texture aspect ratio (width / height), known only once it has loaded. */
  aspect?: number | undefined;
}

/** Creates the image layer; returns the scene object to add. */
export function createImageLayer(props: ImageLayerProps): Object3D {
  // Stable repaint callback; captured so the async texture load (which runs
  // outside any tracked scope) doesn't read it off the reactive props object.
  // eslint-disable-next-line solid/reactivity -- a plain callback, never reactive
  const requestRender = props.requestRender;
  const group = new Group();
  group.renderOrder = 2;

  // One shared unit quad; per-mesh scale handles the fit sizing.
  const quad = new PlaneGeometry(1, 1);
  const textureLoader = new TextureLoader();
  // Reference counts index the live material uniforms so eviction/release is
  // O(1), including multiple meshes displaying the same cached texture.
  const textureReferences = new Map<Texture, number>();
  const evictedTextures = new Set<Texture>();
  const textureCache = new LRUCache<string, Texture>({
    max: 512,
    dispose: (texture) => {
      if (textureReferences.has(texture)) evictedTextures.add(texture);
      else texture.dispose();
    },
  });
  const entries = new Map<string, ImageEntry>();
  let zoom = 1;
  // The image source the pooled meshes / cached textures belong to. The same
  // `safeName` may map to a different image under another key, so everything
  // is dropped when it changes (see update) to avoid mixing the sources.
  let currentSessionKey: string | null = null;
  let sourceGeneration = 0;

  const aspectOf = (texture: Texture): number | undefined => {
    const image = texture.image as
      | { width?: number; height?: number }
      | undefined;
    if (image?.width && image.height) return image.width / image.height;
    return undefined;
  };

  /** Scales a mesh to the largest size fitting the box at the texture aspect. */
  const applyFit = (entry: ImageEntry) => {
    let width = entry.width;
    let height = entry.height;
    const aspect = entry.aspect;
    if (aspect && Number.isFinite(aspect) && aspect > 0) {
      const boxAspect = entry.width / entry.height;
      if (aspect > boxAspect) height = entry.width / aspect;
      else width = entry.height * aspect;
    }
    entry.mesh.scale.set(width * zoom, height * zoom, 1);
    entry.mesh.position.x =
      entry.x + (entry.isLeftAligned ? (width * zoom) / 2 : 0);
    props.onLayout?.(
      entry.key,
      width * zoom,
      height * zoom,
      entry.material.uniforms['uMap']!.value !== null,
    );
  };

  const createEntry = (
    spec: ImageSpec,
    generation: number,
    url: string,
  ): ImageEntry => {
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
    const mesh = new Mesh(quad, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    group.add(mesh);
    const entry: ImageEntry = {
      key: spec.key,
      x: spec.x,
      isLeftAligned: spec.anchorX === 'left',
      url,
      mesh,
      material,
      width: spec.width ?? SAMPLE_IMAGE_BOX_WIDTH_PX,
      height: spec.height ?? SAMPLE_IMAGE_BOX_HEIGHT_PX,
    };

    const cached = textureCache.get(url);
    if (cached) {
      material.uniforms['uMap']!.value = cached;
      textureReferences.set(cached, (textureReferences.get(cached) ?? 0) + 1);
      entry.aspect = aspectOf(cached);
    } else {
      // eslint-disable-next-line solid/reactivity -- Three invokes this async load callback; layout reads the current GPU entry.
      textureLoader.load(url, (texture) => {
        // Drop loads that resolve after an image-source switch — caching them
        // would reintroduce the old source's image under this safeName.
        if (generation !== sourceGeneration) {
          texture.dispose();
          return;
        }
        texture.minFilter = LinearFilter;
        texture.magFilter = LinearFilter;
        texture.generateMipmaps = false;
        textureCache.set(url, texture);
        if (entries.get(spec.key) === entry) {
          material.uniforms['uMap']!.value = texture;
          textureReferences.set(
            texture,
            (textureReferences.get(texture) ?? 0) + 1,
          );
          entry.aspect = aspectOf(texture);
          applyFit(entry);
          requestRender();
        }
      });
    }
    return entry;
  };

  // A texture belongs to the cache or to its remaining visible meshes.
  // Once both owners release it, dispose it exactly once.
  const removeEntry = (key: string, entry: ImageEntry) => {
    group.remove(entry.mesh);
    const texture = entry.material.uniforms['uMap']!.value as Texture | null;
    if (texture) {
      const remaining = textureReferences.get(texture)! - 1;
      if (remaining > 0) {
        textureReferences.set(texture, remaining);
      } else {
        textureReferences.delete(texture);
        if (evictedTextures.delete(texture)) texture.dispose();
      }
    }
    entry.material.dispose();
    entries.delete(key);
  };

  /** Shows exactly `specs`, creating/removing pooled meshes as needed. */
  const update = (specs: ImageSpec[], sessionKey: string) => {
    // On an image-source switch, drop every pooled mesh and cached texture: the
    // same safeName / font key may refer to a different image now, so reusing
    // them would mix the previous source's images with the new ones.
    if (sessionKey !== currentSessionKey) {
      for (const [key, entry] of entries) removeEntry(key, entry);
      sourceGeneration++;
      textureCache.clear();
      currentSessionKey = sessionKey;
    }

    const wanted = new Set(specs.map((spec) => spec.key));

    // Remove meshes whose font is no longer shown (textures stay cached).
    for (const [key, entry] of entries) {
      if (wanted.has(key)) continue;
      removeEntry(key, entry);
    }

    for (const spec of specs) {
      if (!spec.safeName) continue;
      const url = props.sampleImageUrl(spec.safeName);
      if (!url) continue;
      let entry = entries.get(spec.key);
      if (entry && entry.url !== url) {
        removeEntry(spec.key, entry);
        entry = undefined;
      }
      if (!entry) {
        entry = createEntry(spec, sourceGeneration, url);
        entries.set(spec.key, entry);
      }
      entry.x = spec.x;
      entry.isLeftAligned = spec.anchorX === 'left';
      entry.width = spec.width ?? SAMPLE_IMAGE_BOX_WIDTH_PX;
      entry.height = spec.height ?? SAMPLE_IMAGE_BOX_HEIGHT_PX;
      (entry.material.uniforms['uColor']!.value as Color).copy(spec.color);
      entry.material.uniforms['uOpacity']!.value = spec.opacity;
      entry.mesh.position.set(spec.x, spec.y, 2);
      applyFit(entry);
    }
  };

  // Shown set / image-source identity follow their accessors.
  createEffect(() => {
    update(props.specs(), props.sessionKey());
    requestRender();
  });
  // Keep every image's box constant in CSS pixels across zoom.
  createEffect(() => {
    zoom = props.zoom();
    for (const entry of entries.values()) applyFit(entry);
    requestRender();
  });

  onCleanup(() => {
    currentSessionKey = null;
    sourceGeneration++;
    for (const [key, entry] of entries) removeEntry(key, entry);
    textureCache.clear();
    quad.dispose();
  });

  return group;
}
