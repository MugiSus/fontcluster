import {
  AddEquation,
  CustomBlending,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { blitFragmentShader, blitVertexShader } from './blit-shaders';

/**
 * The glow buffer's resolution relative to the screen. Keep this at full
 * resolution while evaluating stripe and glow quality; lowering it trades sharp
 * mask fidelity for fill-rate savings.
 */
const GLOW_SCALE = 1.0;

/**
 * Whole-glow-layer opacity, multiplied in once when the buffer is composited
 * over the screen. The halos 'over'-composite in the buffer to an ordinary
 * [0, 1] opacity (overlaps asymptote toward 1); this scale then dims that whole
 * opacity at draw time — a region that reached alpha 1 veils at 0.4, one at 0.5
 * veils at 0.2, and so on. The per-halo opacity (see point-layer's GLOW_OPACITY)
 * sets how fast overlaps approach 1. Because the buffer is premultiplied, the
 * blit scales rgb and alpha together, so it stays premultiplied-safe.
 */
const GLOW_LAYER_OPACITY = 0.4;

/**
 * Bloom compositor: a full-resolution half-float buffer for the glow, plus the
 * pass that composites it back over the screen.
 *
 * The glow's many translucent halos stack on the same pixels with normal 'over'
 * blending, which bands badly when accumulated straight onto an 8-bit screen (the
 * gradient is re-quantized on every blend and the errors compound). So the
 * orchestrator renders the glow *halos only* into {@link target}, a 16-bit float
 * ({@link HalfFloatType}) buffer where the accumulation stays smooth, then calls
 * {@link composite} to apply that buffer over the already-drawn sharp content.
 * Only this one composite hits the 8-bit screen, so no banding forms.
 *
 * The halos are written premultiplied and accumulate with normal 'over' blending
 * (src One, dst OneMinusSrcAlpha) in both themes, so opacity asymptotes toward 1
 * and stays in [0, 1]. The screen composite is an 'over' veil scaled by
 * {@link GLOW_LAYER_OPACITY}, so a region that reached alpha 1 veils at 40% over
 * the background, one at 0.5 veils at 20%, etc. Themes differ only in the halo
 * colors, not the blend.
 *
 * Keeping the buffer split out from the sharp scene lets the glow accumulate in
 * half-float precision while the sharp dots / rings / images / tree stay in the
 * ordinary full-resolution screen pass.
 */
export function createGlowCompositor() {
  // The glow accumulation buffer. Half-float so the overlaps don't band; no
  // depth/stencil (only the point halos draw into it, depth-test off).
  const glowTarget = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
  });
  // Raw passthrough (see the renderer's outputColorSpace note).
  glowTarget.texture.colorSpace = LinearSRGBColorSpace;
  glowTarget.texture.minFilter = LinearFilter;
  glowTarget.texture.magFilter = LinearFilter;
  glowTarget.texture.generateMipmaps = false;

  // A single full-screen quad that samples the glow buffer. Its geometry already
  // spans clip space, so the camera is just a formality of render()'s signature.
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new ShaderMaterial({
    uniforms: {
      uTexture: { value: glowTarget.texture },
      uLayerOpacity: { value: GLOW_LAYER_OPACITY },
    },
    vertexShader: blitVertexShader,
    fragmentShader: blitFragmentShader,
    // transparent so three honours the custom blend when drawing this quad.
    transparent: true,
    depthTest: false,
    depthWrite: false,
    // Blend the glow buffer onto whatever is already on screen as an 'over' veil
    // (src + dst·(1 - srcAlpha)). CustomBlending so the exact equation is
    // unambiguous; composite() re-applies the factors per call.
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
  });
  const quad = new Mesh(new PlaneGeometry(2, 2), material);
  scene.add(quad);

  /**
   * Sizes the glow buffer to {@link GLOW_SCALE} of the renderer's drawing-buffer
   * resolution (CSS size × pixel ratio). At 1.0 this is full resolution.
   */
  const setSize = (drawingBufferWidth: number, drawingBufferHeight: number) => {
    glowTarget.setSize(
      Math.max(1, Math.floor(drawingBufferWidth * GLOW_SCALE)),
      Math.max(1, Math.floor(drawingBufferHeight * GLOW_SCALE)),
    );
  };

  /**
   * Blits the glow buffer onto the current render target (the screen),
   * upsampling it to full resolution. Premultiplied 'over' veil (src One, dst
   * OneMinusSrcAlpha), the same in both themes; the blit scales the layer by
   * GLOW_LAYER_OPACITY so the veil tops out there. Leaves autoClear as it found
   * it so the sharp pass is not wiped.
   */
  const composite = (renderer: WebGLRenderer) => {
    material.blendEquation = AddEquation;
    material.blendSrc = OneFactor;
    material.blendDst = OneMinusSrcAlphaFactor;
    // eslint-disable-next-line @typescript-eslint/naming-convention -- captures three.js renderer.autoClear to restore after render
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
