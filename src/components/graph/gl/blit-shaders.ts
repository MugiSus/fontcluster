// GLSL for the full-screen blit that copies the half-float scene buffer to the
// screen. This is the single point where the high-precision (16-bit float)
// accumulation is quantized down to the 8-bit screen. See
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
 * Samples the half-float scene buffer 1:1 and writes it to the screen.
 *
 * The scene was accumulated in 16-bit float so additive overlaps stay smooth;
 * this pass is the single quantization down to the 8-bit screen.
 */
export const blitFragmentShader = /* glsl */ `
uniform sampler2D uTexture;

varying vec2 vUv;

void main() {
  gl_FragColor = vec4(texture2D(uTexture, vUv).rgb, 1.0);
}
`;
