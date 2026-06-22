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
 * Bloom compositor: a full-resolution half-float buffer for the glow, plus the
 * pass that composites it back over the screen.
 *
 * The glow's many translucent halos stack on the same pixels — additively in
 * dark mode, with normal 'over' blending in light mode — which bands badly when
 * accumulated straight onto an 8-bit screen (the gradient is re-quantized on
 * every blend and the errors compound). So the orchestrator renders the glow
 * *halos only* into {@link target}, a 16-bit float ({@link HalfFloatType})
 * buffer where the accumulation stays smooth, then calls {@link composite} to
 * apply that buffer over the already-drawn sharp content. Only this one
 * composite hits the 8-bit screen, so no banding forms.
 *
 * The halos are written premultiplied, so both the buffer accumulation and the
 * final composite keep a src factor of One and select the operator with the dst
 * factor alone (One = additive, OneMinusSrcAlpha = over).
 *
 * Keeping the buffer split out from the sharp scene lets the glow accumulate in
 * half-float precision while the sharp dots / rings / images / axes stay in the
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
    uniforms: { uTexture: { value: glowTarget.texture } },
    vertexShader: blitVertexShader,
    fragmentShader: blitFragmentShader,
    // transparent so three honours the custom blend when drawing this quad.
    transparent: true,
    depthTest: false,
    depthWrite: false,
    // Composite the glow over the already-drawn sharp content. composite() sets
    // the factors per call (these defaults are the dark additive path, dst + src;
    // the light path swaps the dst factor for 'over' = normal blending). Always
    // CustomBlending so the exact equation is unambiguous and re-applied.
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneFactor,
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
   * Blits the glow buffer over the current render target (the screen),
   * upsampling it to full resolution. `additive` picks the blend used over the
   * sharp content, matching how the halos were accumulated: dark glow adds light
   * (dst + src), light glow multiplies a subtractive tint (dst * src). Either
   * way it leaves autoClear as it found it so the sharp pass is not wiped.
   */
  const composite = (renderer: WebGLRenderer, additive: boolean) => {
    // The buffer holds premultiplied glow, so src factor stays One and only the
    // dst factor selects the operator: additive (dark) = dst + src; 'over' =
    // normal blending (light) = src + dst*(1 - srcAlpha).
    material.blendEquation = AddEquation;
    material.blendSrc = OneFactor;
    material.blendDst = additive ? OneFactor : OneMinusSrcAlphaFactor;
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
