import {
  type Camera,
  HalfFloatType,
  LinearSRGBColorSpace,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { blitFragmentShader, blitVertexShader } from './blit-shaders';

/**
 * Two-pass compositor that removes glow banding.
 *
 * The graph's dark-mode glow uses additive blending: many translucent sprites
 * stack on the same pixels. Done straight to the screen this re-quantizes the
 * smooth halo gradient to 8 bits on every blend, and the rounding errors pile
 * up into visible contour rings.
 *
 * Instead we render the whole scene into a 16-bit float ({@link HalfFloatType})
 * off-screen target — where the accumulation stays effectively continuous, so
 * no banding forms — and then blit that buffer to the screen in a single pass,
 * quantizing to 8 bits exactly once and dithering as we do (see
 * {@link blitFragmentShader}).
 *
 * It is only worth its cost (one extra full-screen pass + the float buffer's
 * bandwidth) while the glow is on; the orchestrator renders straight to the
 * screen otherwise.
 */
export function createGlowCompositor() {
  // The off-screen buffer the scene accumulates into. Half-float so additive
  // overlaps don't clip or band. It mirrors the default framebuffer (depth on,
  // no MSAA) so layer ordering is identical to the direct-to-screen path.
  const renderTarget = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    depthBuffer: true,
    stencilBuffer: false,
  });
  // Raw passthrough, like the rest of the pipeline: store/sample the values
  // verbatim so nothing re-encodes the already-sRGB colors (see the renderer's
  // outputColorSpace note). The blit maps the buffer 1:1 onto the screen, so
  // point sampling is exact and needs no mipmaps.
  renderTarget.texture.colorSpace = LinearSRGBColorSpace;
  renderTarget.texture.minFilter = NearestFilter;
  renderTarget.texture.magFilter = NearestFilter;
  renderTarget.texture.generateMipmaps = false;

  // A scene holding a single full-screen quad for the blit pass. The quad's
  // geometry already spans clip space, so the camera is a formality three's
  // render() signature requires.
  const blitScene = new Scene();
  const blitCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const blitMaterial = new ShaderMaterial({
    uniforms: { uTexture: { value: renderTarget.texture } },
    vertexShader: blitVertexShader,
    fragmentShader: blitFragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  const blitQuad = new Mesh(new PlaneGeometry(2, 2), blitMaterial);
  blitScene.add(blitQuad);

  /**
   * Resizes the off-screen buffer to the renderer's *drawing-buffer* resolution
   * (CSS size × pixel ratio), so the blit is a 1:1 copy with no rescaling.
   */
  const setSize = (drawingBufferWidth: number, drawingBufferHeight: number) => {
    renderTarget.setSize(
      Math.max(1, Math.floor(drawingBufferWidth)),
      Math.max(1, Math.floor(drawingBufferHeight)),
    );
  };

  /**
   * Renders `scene`/`camera` into the float target, then blits it to the screen
   * with the output dither. Leaves the renderer targeting the screen.
   */
  const render = (renderer: WebGLRenderer, scene: Scene, camera: Camera) => {
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(blitScene, blitCamera);
  };

  const dispose = () => {
    renderTarget.dispose();
    blitMaterial.dispose();
    blitQuad.geometry.dispose();
  };

  return { setSize, render, dispose };
}
