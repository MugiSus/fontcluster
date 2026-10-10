import { createRoot, createSignal } from 'solid-js';
import {
  type BufferGeometry,
  Color,
  type Mesh,
  type ShaderMaterial,
  Texture,
  TextureLoader,
} from 'three';
import {
  createImageLayer,
  type ImageSpec,
} from '../../src/components/graph/gl/image-layer';

type Check = (name: string, actual: number, expected: number) => void;

/** Exercise loads deterministically, including completion after source disposal. */
export function checkImageLifecycle(check: Check) {
  const originalLoad = TextureLoader.prototype.load;
  const loads: { texture: Texture; complete: () => void; fail: () => void }[] =
    [];
  let disposedTextures = 0;
  TextureLoader.prototype.load = function (_url, onLoad, _onProgress, onError) {
    const texture = new Texture<HTMLImageElement>();
    texture.addEventListener('dispose', () => disposedTextures++);
    loads.push({
      texture,
      fail: () => onError?.(new Error('Simulated transient image failure')),
      complete: () => {
        texture.image = document.createElement('img');
        texture.image.width = 120;
        texture.image.height = 30;
        onLoad?.(texture);
      },
    });
    return texture;
  };
  let dispose = () => {};
  try {
    const spec = (key: string): ImageSpec => ({
      key,
      safeName: 'shared',
      x: 0,
      y: 0,
      color: new Color('white'),
      opacity: 1,
    });
    let renders = 0;
    const context = createRoot((cleanup) => {
      dispose = cleanup;
      const [specs, setSpecs] = createSignal([spec('leaf'), spec('alias')]);
      const [sessionKey, setSessionKey] = createSignal('first');
      const layer = createImageLayer({
        specs,
        sessionKey,
        zoom: () => 2,
        sampleImageUrl: (name) => `test:${name}`,
        requestRender: () => renders++,
      });
      return { layer, setSpecs, setSessionKey };
    });
    check('aliases share an in-flight texture', loads.length, 1);
    const meshes = context.layer.children as Mesh<
      BufferGeometry,
      ShaderMaterial
    >[];
    const material = meshes[0]!.material;
    loads[0]!.complete();
    check(
      'both aliases become visible after load',
      meshes.filter((m) => m.visible).length,
      2,
    );
    check(
      'aliases share the loaded texture',
      Number(
        meshes.every(
          (m) => m.material.uniforms['uMap']!.value === loads[0]!.texture,
        ),
      ),
      1,
    );
    context.setSpecs([spec('replacement'), spec('another-alias')]);
    check(
      'selection reuses the material',
      Number(meshes[0]!.material === material),
      1,
    );
    check('selection reuses the texture', loads.length, 1);
    context.setSessionKey('second');
    check('source switch disposes old textures', disposedTextures, 1);
    check('source switch loads the new texture once', loads.length, 2);
    context.setSessionKey('third');
    const beforeLateLoad = renders;
    loads[1]!.complete();
    check(
      'late old-session completion does not repaint',
      renders - beforeLateLoad,
      0,
    );
    check(
      'late old-session image stays hidden',
      meshes.filter((m) => m.visible).length,
      0,
    );
    loads[2]!.fail();
    check('failed texture is disposed', disposedTextures, 3);
    context.setSpecs([spec('retry'), spec('retry-alias')]);
    check('failed sample can be requested again', loads.length, 4);
    dispose();
    const afterDispose = renders;
    loads[3]!.complete();
    check(
      'completion after unmount does not repaint',
      renders - afterDispose,
      0,
    );
    check('all session textures are disposed', disposedTextures, 4);
  } finally {
    dispose();
    TextureLoader.prototype.load = originalLoad;
  }
}
