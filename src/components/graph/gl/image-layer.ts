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
import { convertFileSrc } from '@tauri-apps/api/core';
import { imageFragmentShader, imageVertexShader } from './image-shaders';

/** The box (CSS px) a sample image is fit inside, matching the SVG masked rect. */
const BOX_WIDTH_PX = 128;
const BOX_HEIGHT_PX = 26;

/** One sample image to draw, centered (in world space) on its point. */
export interface ImageSpec {
  /** Stable font key, used to pool meshes across updates. */
  key: string;
  /** Sample folder name, used to build the texture URL. */
  safeName: string;
  x: number;
  y: number;
  /** Cluster tint applied to the (luminance-masked) sample. */
  color: number;
  /** 1 for active points, lower for dimmed ones. */
  opacity: number;
}

/**
 * The cluster-tinted sample images.
 *
 * Each image is a quad textured with the font's `sample.png`, tinted by its
 * cluster color and masked by the sample's luminance (see image-shaders). The
 * quad is fit inside a fixed CSS-pixel box without distorting the texture's
 * aspect ratio (the SVG `xMidYMid meet` behaviour).
 *
 * Meshes are pooled by font key, and textures are cached by sample name so
 * revisiting a font does not reload it. Textures load asynchronously, so the
 * factory takes a `requestRender` callback to repaint once one arrives.
 */
export interface ImageLayer {
  /** The three.js object to add to the (un-bloomed) overlay scene. */
  readonly object: Object3D;
  /** Shows exactly these images, creating/removing pooled meshes as needed. */
  update(specs: ImageSpec[], sessionDirectory: string): void;
  /** Rescales every image so its box stays constant in CSS pixels on zoom. */
  setZoom(zoom: number): void;
  /** Releases GPU resources (meshes, materials and cached textures). */
  dispose(): void;
}

interface ImageEntry {
  mesh: Mesh;
  material: ShaderMaterial;
  /** Texture aspect ratio (width / height), known only once it has loaded. */
  aspect?: number | undefined;
}

/** Creates the {@link ImageLayer}. `requestRender` is called after async loads. */
export function createImageLayer(requestRender: () => void): ImageLayer {
  const group = new Group();
  group.renderOrder = 2;

  // One shared unit quad; per-mesh scale handles the fit sizing.
  const quad = new PlaneGeometry(1, 1);
  const textureLoader = new TextureLoader();
  const textureCache = new Map<string, Texture>();
  const entries = new Map<string, ImageEntry>();
  let zoom = 1;
  // The session the pooled meshes / cached textures belong to. The same
  // `safeName` maps to a different file in another session, so everything is
  // dropped when this changes (see update) to avoid mixing old and new images.
  let currentSession: string | null = null;

  const aspectOf = (texture: Texture): number | undefined => {
    const image = texture.image as
      | { width?: number; height?: number }
      | undefined;
    if (image?.width && image.height) return image.width / image.height;
    return undefined;
  };

  /** Scales a mesh to the largest size fitting the box at the texture aspect. */
  const applyFit = (entry: ImageEntry) => {
    let width = BOX_WIDTH_PX;
    let height = BOX_HEIGHT_PX;
    const aspect = entry.aspect;
    if (aspect && Number.isFinite(aspect) && aspect > 0) {
      const boxAspect = BOX_WIDTH_PX / BOX_HEIGHT_PX;
      if (aspect > boxAspect) height = BOX_WIDTH_PX / aspect;
      else width = BOX_HEIGHT_PX * aspect;
    }
    entry.mesh.scale.set(width * zoom, height * zoom, 1);
  };

  const createEntry = (
    spec: ImageSpec,
    sessionDirectory: string,
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
    const entry: ImageEntry = { mesh, material };

    const cached = textureCache.get(spec.safeName);
    if (cached) {
      material.uniforms['uMap']!.value = cached;
      entry.aspect = aspectOf(cached);
    } else {
      const url = convertFileSrc(
        `${sessionDirectory}/samples/${spec.safeName}/sample.png`,
      );
      textureLoader.load(url, (texture) => {
        // Drop loads that resolve after a session switch — caching them would
        // reintroduce the old session's image under this safeName.
        if (sessionDirectory !== currentSession) {
          texture.dispose();
          return;
        }
        texture.minFilter = LinearFilter;
        texture.magFilter = LinearFilter;
        texture.generateMipmaps = false;
        textureCache.set(spec.safeName, texture);
        material.uniforms['uMap']!.value = texture;
        entry.aspect = aspectOf(texture);
        applyFit(entry);
        requestRender();
      });
    }
    return entry;
  };

  return {
    object: group,

    update(specs, sessionDirectory) {
      // On a session switch, drop every pooled mesh and cached texture: the same
      // safeName / font key refers to a different file now, so reusing them would
      // mix the previous session's images with the new ones.
      if (sessionDirectory !== currentSession) {
        for (const entry of entries.values()) {
          group.remove(entry.mesh);
          entry.material.dispose();
        }
        entries.clear();
        for (const texture of textureCache.values()) texture.dispose();
        textureCache.clear();
        currentSession = sessionDirectory;
      }

      const wanted = new Set(specs.map((spec) => spec.key));

      // Remove meshes whose font is no longer shown (textures stay cached).
      for (const [key, entry] of entries) {
        if (wanted.has(key)) continue;
        group.remove(entry.mesh);
        entry.material.dispose();
        entries.delete(key);
      }

      for (const spec of specs) {
        if (!sessionDirectory || !spec.safeName) continue;
        let entry = entries.get(spec.key);
        if (!entry) {
          entry = createEntry(spec, sessionDirectory);
          entries.set(spec.key, entry);
        }
        (entry.material.uniforms['uColor']!.value as Color).set(spec.color);
        entry.material.uniforms['uOpacity']!.value = spec.opacity;
        entry.mesh.position.set(spec.x, spec.y, 2);
        applyFit(entry);
      }
    },

    setZoom(nextZoom) {
      zoom = nextZoom;
      for (const entry of entries.values()) applyFit(entry);
    },

    dispose() {
      for (const entry of entries.values()) entry.material.dispose();
      entries.clear();
      for (const texture of textureCache.values()) texture.dispose();
      textureCache.clear();
      quad.dispose();
    },
  };
}
