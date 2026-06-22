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
uniform float uSize;        // blur diameter (CSS px)
uniform float uCore;        // solid core diameter (CSS px)
uniform float uGlowEnabled; // 1 = full glow sprite, 0 = shrink to the core dot

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

  // Without the glow, shrink the sprite to just the core dot: the halo area is
  // pure fill-rate cost (the fragment would zero it out anyway). The visible dot
  // stays the same size because vCoreFrac scales with the sprite.
  float spriteSize = uGlowEnabled > 0.5 ? uSize : uCore;
  vCoreFrac = uCore / spriteSize;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = spriteSize * scale * uPixelRatio;
}
`;

export const pointFragmentShader = /* glsl */ `
uniform float uOpacity; // peak opacity at the core (the glow fades out from here)
uniform float uGlowEnabled; // 1 = draw the halo glow, 0 = just the core dot

varying vec3 vColor;
varying float vAlpha;
varying float vGlow;
varying float vCoreFrac;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float dist = length(uv);
  if (dist > 1.0) discard;

  // Fixed-size solid core, plus a soft faint halo spanning the whole sprite.
  // The core is full strength; uOpacity scales down only the halo glow, so a
  // non-dimmed point keeps its true (opaque) color at the center.
  float core = smoothstep(vCoreFrac, vCoreFrac * 0.8, dist);
  float halo = pow(max(0.0, 1.0 - dist), 3.0);
  float intensity = clamp(core + halo * uOpacity * vGlow * uGlowEnabled, 0.0, 1.0);

  // Straight alpha; the material's blend mode (additive on dark, normal on
  // light) decides how this composites over the background. Banding from the
  // 8-bit framebuffer is handled downstream: when the glow is on the scene
  // accumulates into a half-float target instead (see GlowCompositor).
  gl_FragColor = vec4(vColor, intensity * vAlpha);
}
`;
