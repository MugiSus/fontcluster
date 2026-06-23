// GLSL for the full-screen quad that composites the half-float glow buffer back
// over the screen. The glow is a normal premultiplied 'over' layer (the material
// keeps src = One, dst = OneMinusSrcAlpha), scaled by the layer opacity. This
// composite is the single point where the high-precision (16-bit float) glow
// accumulation is quantized down to the 8-bit screen — so the only banding left
// is an ordinary single-quantization gradient, not the compounded kind. See
// {@link createGlowCompositor}.

/**
 * Draws a full-screen quad. The geometry is a PlaneGeometry(2, 2) whose vertex
 * positions already span clip space (-1..1), so no camera projection is needed.
 */
export const blitVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Reads the premultiplied half-float glow buffer (halos 'over'-composited, so the
 * opacity asymptotes toward 1 and stays in [0, 1]) and scales it by
 * {@link uLayerOpacity}. The material blends it src = One, dst = OneMinusSrcAlpha,
 * so the screen result is `glow + background·(1 - glowAlpha)` — the glow veils
 * the background instead of adding onto it, and the scale dims the whole layer
 * (a region that reached alpha 1 veils at uLayerOpacity). Premultiplied, so
 * scaling the sample moves rgb and alpha together and stays premultiplied-valid.
 *
 * The glow was accumulated in 16-bit float so the overlaps stay smooth; this
 * composite is the single quantization down to the 8-bit screen.
 */
export const blitFragmentShader = /* glsl */ `
uniform sampler2D uTexture;
uniform float uLayerOpacity; // whole-layer opacity ceiling

varying vec2 vUv;

void main() {
  gl_FragColor = texture2D(uTexture, vUv) * uLayerOpacity;
}
`;
