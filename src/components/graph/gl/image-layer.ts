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
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  SAMPLE_IMAGE_BOX_HEIGHT_PX,
  SAMPLE_IMAGE_BOX_WIDTH_PX,
} from '@/components/graph/constants';
import { imageFragmentShader, imageVertexShader } from './image-shaders';

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
 * revisiting a font does not reload it. The shown set, session and zoom all
 * follow their accessors via effects; `requestRender` repaints once an async
 * texture arrives (and after each reactive update).
 */
export interface ImageLayerProps {
  /** The images to show; meshes are pooled by `spec.key` across updates. */
  specs: Accessor<ImageSpec[]>;
  /** Session the pooled meshes / cached textures belong to (drops all on change). */
  sessionDirectory: Accessor<string>;
  /** World-units-per-CSS-pixel factor so the box stays constant on zoom. */
  zoom: Accessor<number>;
  /** Schedules a repaint of the (on-demand) render loop. */
  requestRender: () => void;
}

interface ImageEntry {
  safeName: string;
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
    let width = SAMPLE_IMAGE_BOX_WIDTH_PX;
    let height = SAMPLE_IMAGE_BOX_HEIGHT_PX;
    const aspect = entry.aspect;
    if (aspect && Number.isFinite(aspect) && aspect > 0) {
      const boxAspect = SAMPLE_IMAGE_BOX_WIDTH_PX / SAMPLE_IMAGE_BOX_HEIGHT_PX;
      if (aspect > boxAspect) height = SAMPLE_IMAGE_BOX_WIDTH_PX / aspect;
      else width = SAMPLE_IMAGE_BOX_HEIGHT_PX * aspect;
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
    const entry: ImageEntry = { safeName: spec.safeName, mesh, material };

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
        if (entries.get(spec.key) === entry) {
          material.uniforms['uMap']!.value = texture;
          entry.aspect = aspectOf(texture);
          applyFit(entry);
          requestRender();
        }
      });
    }
    return entry;
  };

  /** Shows exactly `specs`, creating/removing pooled meshes as needed. */
  const update = (specs: ImageSpec[], sessionDirectory: string) => {
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
      if (entry && entry.safeName !== spec.safeName) {
        group.remove(entry.mesh);
        entry.material.dispose();
        entries.delete(spec.key);
        entry = undefined;
      }
      if (!entry) {
        entry = createEntry(spec, sessionDirectory);
        entries.set(spec.key, entry);
      }
      (entry.material.uniforms['uColor']!.value as Color).set(spec.color);
      entry.material.uniforms['uOpacity']!.value = spec.opacity;
      entry.mesh.position.set(spec.x, spec.y, 2);
      applyFit(entry);
    }
  };

  // Shown set / session follow their accessors.
  createEffect(() => {
    update(props.specs(), props.sessionDirectory());
    requestRender();
  });
  // Keep every image's box constant in CSS pixels across zoom.
  createEffect(() => {
    zoom = props.zoom();
    for (const entry of entries.values()) applyFit(entry);
    requestRender();
  });

  onCleanup(() => {
    for (const entry of entries.values()) entry.material.dispose();
    entries.clear();
    for (const texture of textureCache.values()) texture.dispose();
    textureCache.clear();
    quad.dispose();
  });

  return group;
}
