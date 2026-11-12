import {
  type Accessor,
  type Resource,
  createEffect,
  createMemo,
  createResource,
  getOwner,
  indexArray,
  onCleanup,
  runWithOwner,
} from 'solid-js';
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
  /** Sample folder name, used to build the texture URL. */
  safeName: string;
  x: number;
  y: number;
  /** Cluster tint applied to the (luminance-masked) sample. */
  color: Color;
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
 * Solid manages one mesh per visible array slot. Textures are cached by URL
 * for the current session, so aliases and revisits share completed/pending
 * loads. The shown set, image-source identity and zoom follow their accessors;
 * `requestRender` repaints after each reactive update, including loaded images.
 */
export interface ImageLayerProps {
  /** Images to show; Solid reuses the mesh/material at each array index. */
  specs: Accessor<ImageSpec[]>;
  /** Image-source identity; releases cached textures when the session changes. */
  sessionKey: Accessor<string>;
  /** Resolves a sample folder name to a URL loadable by three.js. */
  sampleImageUrl: (safeName: string) => string | undefined;
  /** World-units-per-CSS-pixel factor so the box stays constant on zoom. */
  zoom: Accessor<number>;
  /** Schedules a repaint of the (on-demand) render loop. */
  requestRender: () => void;
}

/** Owns session textures and visible mesh slots; selection stays upstream. */
export function createImageLayer(props: ImageLayerProps): Object3D {
  const group = new Group();
  group.renderOrder = 2;
  const quad = new PlaneGeometry(1, 1);
  const textureLoader = new TextureLoader();

  // Cache the Resource, including pending loads, so merge-node aliases share
  // one texture. The session owner outlives individual visible mesh slots.
  const getTexture = createMemo(() => {
    props.sessionKey();
    const owner = getOwner();
    const cache = new Map<string, Resource<Texture | undefined>>();
    onCleanup(() => cache.clear());

    return (url: string) => {
      const cached = cache.get(url);
      if (cached) return cached;
      const resource = runWithOwner(owner, () => {
        const loaded = textureLoader
          .loadAsync(url)
          .then((texture) => {
            texture.minFilter = LinearFilter;
            texture.magFilter = LinearFilter;
            texture.generateMipmaps = false;
            return texture;
          })
          .catch(() => {
            // Allow a later visibility update to retry a failed sample.
            cache.delete(url);
            return undefined;
          });
        // Also releases a load that finishes after the session was disposed.
        onCleanup(() => {
          void loaded.then((texture) => texture?.dispose());
        });
        const [sample] = createResource(() => loaded);
        return sample;
      })!;
      cache.set(url, resource);
      return resource;
    };
  });

  const meshes = indexArray(
    () => props.specs(),
    (spec) => {
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

      const sample = createMemo(() => {
        const load = getTexture();
        const safeName = spec().safeName;
        const url = safeName ? props.sampleImageUrl(safeName) : undefined;
        return url ? load(url) : undefined;
      });
      createEffect(() => {
        const current = spec();
        (material.uniforms['uColor']!.value as Color).copy(current.color);
        material.uniforms['uOpacity']!.value = current.opacity;
        mesh.position.set(current.x, current.y, 2);
        props.requestRender();
      });
      createEffect(() => {
        const texture = sample()?.();
        mesh.visible = texture !== undefined;
        material.uniforms['uMap']!.value = texture ?? null;
        const image = texture?.image as
          | { width: number; height: number }
          | undefined;
        if (image) {
          const aspect = image.width / image.height;
          const isWide =
            aspect > SAMPLE_IMAGE_BOX_WIDTH_PX / SAMPLE_IMAGE_BOX_HEIGHT_PX;
          const width = isWide
            ? SAMPLE_IMAGE_BOX_WIDTH_PX
            : SAMPLE_IMAGE_BOX_HEIGHT_PX * aspect;
          const height = isWide
            ? SAMPLE_IMAGE_BOX_WIDTH_PX / aspect
            : SAMPLE_IMAGE_BOX_HEIGHT_PX;
          const zoom = props.zoom();
          mesh.scale.set(width * zoom, height * zoom, 1);
        }
        props.requestRender();
      });
      onCleanup(() => {
        group.remove(mesh);
        material.dispose();
      });
      return mesh;
    },
  );

  createEffect(() => {
    meshes();
    props.requestRender();
  });
  onCleanup(() => quad.dispose());
  return group;
}
