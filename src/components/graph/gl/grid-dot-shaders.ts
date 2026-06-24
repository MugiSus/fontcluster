/**
 * Projects the grid plane and exposes graph-space coordinates to the fragment
 * shader.
 *
 * The renderer stores graph points as y-down data but draws the scene in a
 * y-up Three.js world, so this shader flips world Y back to graph Y before the
 * fragment shader compares the fragment against the raw-coordinate grid.
 */
export const gridDotVertexShader = /* glsl */ `
varying vec2 vGraphCoordinate;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vGraphCoordinate = vec2(worldPosition.x, -worldPosition.y);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

/**
 * Procedurally draws an infinite-looking lattice of circular dots.
 *
 * `uOrigin` is raw coordinate (0, 0) after display normalization, and `uStep` is
 * the raw grid spacing after the same raw-to-graph scale. The signed distance is
 * converted from graph units into CSS pixels so the dot radius remains stable
 * while the user zooms or pans the graph.
 */
export const gridDotFragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uGraphUnitsPerPixel;
uniform float uOpacity;
uniform float uRadiusPx;
uniform vec2 uOrigin;
uniform float uStep;
varying vec2 vGraphCoordinate;

void main() {
  vec2 gridDistance = (fract((vGraphCoordinate - uOrigin) / uStep + vec2(0.5)) - vec2(0.5)) * uStep;
  float distPx = length(gridDistance) / max(uGraphUnitsPerPixel, 0.000001);
  float alpha = 1.0 - smoothstep(uRadiusPx - 0.5, uRadiusPx + 0.5, distPx);
  if (alpha <= 0.0) discard;
  gl_FragColor = vec4(uColor, alpha * uOpacity);
}
`;
