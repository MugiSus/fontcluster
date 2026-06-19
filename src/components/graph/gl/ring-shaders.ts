// Thin, crisp selection/hover/family ring drawn as a screen-sized point sprite.
// `aRadiusPx` is the ring radius in CSS pixels. Kept out of the bloom pass so it
// stays sharp rather than glowing.

export const ringVertexShader = /* glsl */ `
attribute vec3 aColor;
attribute float aRadiusPx;

uniform float uPixelRatio;

varying vec3 vColor;

void main() {
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aRadiusPx * 2.0 * uPixelRatio;
}
`;

export const ringFragmentShader = /* glsl */ `
varying vec3 vColor;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float dist = length(uv);

  // A thin antialiased stroke just inside the sprite edge.
  float ringPos = 0.88;
  float halfWidth = 0.005;
  float feather = 0.02;
  float alpha = 1.0 - smoothstep(halfWidth, halfWidth + feather, abs(dist - ringPos));
  if (alpha <= 0.01) discard;

  gl_FragColor = vec4(vColor, alpha * 0.9);
}
`;
