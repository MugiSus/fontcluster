// Glowing selection/hover/family ring drawn as a screen-sized point sprite.
// Replaces the animated dashed SVG circle with a soft pulsing glow that the
// bloom pass amplifies. `aRadiusPx` is the ring radius in CSS pixels.

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
uniform float uTime;

varying vec3 vColor;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float dist = length(uv);

  float pulse = 0.5 + 0.5 * sin(uTime * 3.0);
  float ringPos = 0.85;
  float width = 0.09;

  float ring = smoothstep(width, 0.0, abs(dist - ringPos));
  float glow = (1.0 - smoothstep(ringPos, 1.0, dist)) * 0.12;
  float alpha = ring * (0.75 + 0.25 * pulse) + glow;
  if (alpha <= 0.002 || dist > 1.0) discard;

  gl_FragColor = vec4(vColor * (1.0 + 0.4 * pulse), alpha);
}
`;
