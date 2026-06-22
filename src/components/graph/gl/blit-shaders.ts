// GLSL for the full-screen quad that composites the low-res half-float glow
// buffer back over the screen (the blend — additive or 'over' = normal blending
// — is set on the material). This composite is the single point where the high-
// precision (16-bit float) glow accumulation is quantized down to the 8-bit
// screen — so the only banding left is an ordinary single-quantization gradient,
// not the compounded kind. See {@link createGlowCompositor}.

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
 * Samples the premultiplied half-float glow buffer and outputs it verbatim
 * (rgb + alpha); the material's blend composites it over the sharp content —
 * additive for the dark glow (dst + src), 'over' = normal blending for the light
 * glow (src + dst*(1 - srcAlpha), using the buffer's accumulated alpha).
 *
 * The glow was accumulated in 16-bit float so the overlaps stay smooth; this
 * composite is the single quantization down to the 8-bit screen.
 */
export const blitFragmentShader = /* glsl */ `
uniform sampler2D uTexture;

varying vec2 vUv;

void main() {
  gl_FragColor = texture2D(uTexture, vUv);
}
`;
