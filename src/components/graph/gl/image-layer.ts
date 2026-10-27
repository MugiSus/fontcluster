import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  indexArray,
  onCleanup,
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
  key: string;
  /** Sample folder name, used to build the texture URL. */
  safeName: string;
  x: number;
  y: number;
  /** Cluster tint applied to the (luminance-masked) sample. */
  color: Color;
  /** 1 for active points, lower for dimmed ones. */
  opacity: number;
}

export interface ImageLayerProps {
  specs: Accessor<ImageSpec[]>;
  /** Image-source identity; cached textures belong to exactly one session. */
  sessionKey: Accessor<string>;
  sampleImageUrl: (safeName: string) => string | undefined;
  /** World-units-per-CSS-pixel factor so the box stays constant on zoom. */
  zoom: Accessor<number>;
  requestRender: () => void;
}

interface SampleTexture {
  texture: Texture;
  isReady: Accessor<boolean>;
}

/**
 * Samples use one mesh/material per visible array slot, managed by Solid's
 * indexArray. Changing selection replaces the slot's texture and uniforms,
 * keeping its compiled GPU program alive even when no other sample is shown.
 * Textures (including in-flight loads) are shared by safe name per session.
 */
export function createImageLayer(props: ImageLayerProps): Object3D {
  const group = new Group();
  group.renderOrder = 2;
  const quad = new PlaneGeometry(1, 1);
  const textureLoader = new TextureLoader();

  const getSampleTexture = createMemo(() => {
    props.sessionKey();
    const cache = new Map<string, SampleTexture>();
    let isDisposed = false;
    onCleanup(() => {
      isDisposed = true;
      for (const entry of cache.values()) entry.texture.dispose();
      cache.clear();
    });

    return (safeName: string, url: string): SampleTexture => {
      const cached = cache.get(safeName);
      if (cached) return cached;
      const [isReady, setIsReady] = createSignal(false);
      const texture = textureLoader.load(
        url,
        () => {
          // Old session loads must neither revive resources nor repaint.
          if (!isDisposed) setIsReady(true);
        },
        undefined,
        () => {
          if (isDisposed) return;
          // A transient failure must not poison this session's cache. A later
          // selection/visibility update may request the sample again.
          cache.delete(safeName);
          texture.dispose();
        },
      );
      texture.minFilter = LinearFilter;
      texture.magFilter = LinearFilter;
      texture.generateMipmaps = false;
      const entry = { texture, isReady };
      // Store the loader's texture immediately, so aliases share pending loads.
      cache.set(safeName, entry);
      return entry;
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
        const getTexture = getSampleTexture();
        const safeName = spec().safeName;
        const url = safeName ? props.sampleImageUrl(safeName) : undefined;
        return url ? getTexture(safeName, url) : null;
      });

      createEffect(() => {
        const current = spec();
        (material.uniforms['uColor']!.value as Color).copy(current.color);
        material.uniforms['uOpacity']!.value = current.opacity;
        mesh.position.set(current.x, current.y, 2);
        props.requestRender();
      });

      createEffect(() => {
        const entry = sample();
        mesh.visible = entry?.isReady() ?? false;
        material.uniforms['uMap']!.value = entry?.texture ?? null;
        const image = entry?.texture.image as
          | { width?: number; height?: number }
          | undefined;
        const aspect =
          image?.width && image.height ? image.width / image.height : 0;
        let width = SAMPLE_IMAGE_BOX_WIDTH_PX;
        let height = SAMPLE_IMAGE_BOX_HEIGHT_PX;
        if (aspect > 0 && Number.isFinite(aspect)) {
          if (aspect > width / height) height = width / aspect;
          else width = height * aspect;
        }
        const zoom = props.zoom();
        mesh.scale.set(width * zoom, height * zoom, 1);
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
