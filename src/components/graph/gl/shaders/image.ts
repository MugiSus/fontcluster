// Renders a font sample PNG tinted by its cluster color. This mirrors the SVG
// approach (a cluster-colored rect masked by the sample image's luminance), so
// the texture is treated as a luminance * alpha mask rather than drawn directly.

export const imageVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const imageFragmentShader = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uOpacity;

varying vec2 vUv;

void main() {
  vec4 texel = texture2D(uMap, vUv);
  float mask = dot(texel.rgb, vec3(0.299, 0.587, 0.114)) * texel.a;
  if (mask <= 0.003) discard;
  gl_FragColor = vec4(uColor, mask * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
