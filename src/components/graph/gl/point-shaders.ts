// GLSL for the graph point cloud.
//
// Each point is a screen-space-sized sprite: a small solid core (the data
// point) surrounded by a soft glow halo that fades to zero before the sprite
// edge, so it never lifts the empty background. The fragment output is the same
// in both themes — only the material's blend mode differs (additive on dark,
// normal on light), so the glow composites transparently either way.
//
// `position` / projection uniforms are injected by three's ShaderMaterial, so
// only the custom attributes are declared here.

export const pointVertexShader = /* glsl */ `
attribute vec3 aColor;
attribute float aState; // 0 = active, 1 = dimmed (filtered out / inactive weight)

uniform float uPixelRatio;
uniform float uSizeActive;
uniform float uSizeDimmed;

varying vec3 vColor;
varying float vAlpha;
varying float vGlow;

void main() {
  bool dimmed = aState > 0.5;
  vColor = aColor;
  vAlpha = dimmed ? 0.35 : 1.0;
  vGlow = dimmed ? 0.5 : 1.0;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // The sprite diameter is the glow extent; the core is a fraction of it.
  gl_PointSize = (dimmed ? uSizeDimmed : uSizeActive) * uPixelRatio;
}
`;

export const pointFragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vGlow;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float dist = length(uv);
  if (dist > 1.0) discard;

  // Small solid core plus a soft halo that fades to zero at the sprite edge.
  float core = smoothstep(0.26, 0.12, dist);
  float halo = pow(max(0.0, 1.0 - dist), 2.0);
  float intensity = clamp(core + halo * 0.7 * vGlow, 0.0, 1.0);

  // Straight alpha; the material's blend mode (additive on dark, normal on
  // light) decides how this composites over the background.
  gl_FragColor = vec4(vColor, intensity * vAlpha);
}
`;
