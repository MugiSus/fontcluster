// GLSL for the graph point cloud.
//
// Each point is a screen-space-sized sprite. The sprite diameter is the *blur*
// extent; the solid core (the data dot) is a fixed pixel size, independent of
// the blur radius — the vertex shader converts the core's pixel size into a
// fraction of the current sprite so it stays small as the blur grows. The halo
// fades to zero before the sprite edge, so it never lifts the empty background.
// The fragment output is the same in both themes — only the material's blend
// mode differs (additive on dark, normal on light).
//
// `position` / projection uniforms are injected by three's ShaderMaterial, so
// only the custom attributes are declared here.

export const pointVertexShader = /* glsl */ `
attribute vec3 aColor;
attribute float aState; // 0 = active, 1 = dimmed (filtered out / inactive weight)

uniform float uPixelRatio;
uniform float uSize;   // blur diameter (CSS px)
uniform float uCore;   // solid core diameter (CSS px)

varying vec3 vColor;
varying float vAlpha;
varying float vGlow;
varying float vCoreFrac; // core radius as a fraction of the sprite radius

void main() {
  bool dimmed = aState > 0.5;
  vColor = aColor;
  // Dimmed (filtered-out / inactive) points are 0.6x the size and much fainter.
  float scale = dimmed ? 0.6 : 1.0;
  vAlpha = dimmed ? 0.2 : 1.0;
  vGlow = dimmed ? 0.5 : 1.0;
  vCoreFrac = uCore / uSize; // scale cancels, so the core keeps its proportion

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * scale * uPixelRatio;
}
`;

export const pointFragmentShader = /* glsl */ `
uniform float uOpacity; // peak opacity at the core (the glow fades out from here)

varying vec3 vColor;
varying float vAlpha;
varying float vGlow;
varying float vCoreFrac;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float dist = length(uv);
  if (dist > 1.0) discard;

  // Fixed-size solid core, plus a soft faint halo spanning the whole sprite.
  float core = smoothstep(vCoreFrac, vCoreFrac * 0.55, dist);
  float halo = pow(max(0.0, 1.0 - dist), 3.0);
  float intensity = clamp(core + halo * 0.45 * vGlow, 0.0, 1.0);

  // Straight alpha; the material's blend mode (additive on dark, normal on
  // light) decides how this composites over the background.
  gl_FragColor = vec4(vColor, intensity * vAlpha * uOpacity);
}
`;
