import {
  AddEquation,
  CustomBlending,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  OneFactor,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { blitFragmentShader, blitVertexShader } from './blit-shaders';

/**
 * The glow buffer's resolution relative to the screen. The glow is a soft, low-
 * frequency blur, so rendering it at half resolution is visually free while it
 * quarters the (heavy, high-overdraw) fill cost — the whole point of splitting
 * it out from the sharp content.
 */
const GLOW_SCALE = 0.5;

/**
 * Bloom compositor: a low-resolution half-float buffer for the glow, plus the
 * pass that adds it back over the screen.
 *
 * The dark-mode glow uses additive blending — many translucent sprites stack on
 * the same pixels — which bands badly when accumulated straight onto an 8-bit
 * screen (the gradient is re-quantized on every blend and the errors compound).
 * So the orchestrator renders the glow *halos only* into {@link target}, a
 * 16-bit float ({@link HalfFloatType}) buffer where the accumulation stays
 * smooth, then calls {@link composite} to add that buffer over the already-drawn
 * sharp content. Only this one add hits the 8-bit screen, so no banding forms.
 *
 * Keeping the buffer at {@link GLOW_SCALE} of the screen is what recovers the
 * 4K performance the full-resolution float path cost: the expensive overdraw
 * now happens on a quarter of the pixels, and the sharp dots / rings / images /
 * axes are untouched at full resolution.
 */
export function createGlowCompositor() {
  // The glow accumulation buffer. Half-float so additive overlaps don't band;
  // no depth/stencil (only the point halos draw into it, depth-test off).
  const glowTarget = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
  });
  // Raw passthrough (see the renderer's outputColorSpace note); bilinear so the
  // low-res buffer upsamples smoothly when composited over the full-res screen.
  glowTarget.texture.colorSpace = LinearSRGBColorSpace;
  glowTarget.texture.minFilter = LinearFilter;
  glowTarget.texture.magFilter = LinearFilter;
  glowTarget.texture.generateMipmaps = false;

  // A single full-screen quad that samples the glow buffer. Its geometry already
  // spans clip space, so the camera is just a formality of render()'s signature.
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new ShaderMaterial({
    uniforms: { uTexture: { value: glowTarget.texture } },
    vertexShader: blitVertexShader,
    fragmentShader: blitFragmentShader,
    depthTest: false,
    depthWrite: false,
    // Add the glow over whatever is already on the screen (the sharp pass).
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneFactor,
  });
  const quad = new Mesh(new PlaneGeometry(2, 2), material);
  scene.add(quad);

  /**
   * Sizes the glow buffer to {@link GLOW_SCALE} of the renderer's drawing-buffer
   * resolution (CSS size × pixel ratio).
   */
  const setSize = (drawingBufferWidth: number, drawingBufferHeight: number) => {
    glowTarget.setSize(
      Math.max(1, Math.floor(drawingBufferWidth * GLOW_SCALE)),
      Math.max(1, Math.floor(drawingBufferHeight * GLOW_SCALE)),
    );
  };

  /**
   * Additively blits the glow buffer over the current render target (the
   * screen), upsampling it to full resolution. Leaves autoClear as it found it
   * so it does not wipe the sharp pass already drawn underneath.
   */
  const composite = (renderer: WebGLRenderer) => {
    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(scene, camera);
    renderer.autoClear = previousAutoClear;
  };

  const dispose = () => {
    glowTarget.dispose();
    material.dispose();
    quad.geometry.dispose();
  };

  return {
    /** The half-float buffer the orchestrator renders the glow halos into. */
    target: glowTarget,
    /** The buffer's resolution scale, so the halo pass can size its sprites. */
    glowScale: GLOW_SCALE,
    setSize,
    composite,
    dispose,
  };
}
