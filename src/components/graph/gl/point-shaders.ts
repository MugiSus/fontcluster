// GLSL for the graph point cloud.
//
// Each point is a screen-space-sized sprite. The sprite diameter is the *blur*
// extent; the solid core (the data dot) is a fixed pixel size, independent of
// the blur radius — the vertex shader converts the core's pixel size into a
// fraction of the current sprite so it stays small as the blur grows. The halo
// fades to zero before the sprite edge, so it never lifts the empty background.
//
// The same material draws in one of three passes (`uPass`), so the orchestrator
// can split the cheap-but-sharp core from the heavy-but-blurry halo:
//   0 = combined — core + halo in one sprite (light mode / glow off; rendered
//       straight to the screen, blend mode set by the material).
//   1 = core only — just the data dot, normal-blended to the full-res screen.
//   2 = halo only — just the glow, additively accumulated into the low-res
//       half-float bloom buffer (see GlowCompositor).
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
uniform float uPass;        // 0 = combined, 1 = core only, 2 = halo only

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

  // The sprite footprint depends on the pass. The core pass needs only the tiny
  // core dot (no wasted fill-rate); the halo pass needs the full blur sprite.
  // The combined pass mirrors the old single-pass behaviour: full sprite with
  // the glow, else shrunk to the core dot. The visible dot stays the same size
  // either way because vCoreFrac scales with the sprite.
  float spriteSize;
  if (uPass > 1.5) {
    spriteSize = uSize;                               // halo only
  } else if (uPass > 0.5) {
    spriteSize = uCore;                               // core only
  } else {
    spriteSize = uGlowEnabled > 0.5 ? uSize : uCore;  // combined
  }
  vCoreFrac = uCore / spriteSize;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = spriteSize * scale * uPixelRatio;
}
`;

export const pointFragmentShader = /* glsl */ `
uniform float uOpacity; // peak opacity at the core (the glow fades out from here)
uniform float uGlowEnabled; // 1 = draw the halo glow, 0 = just the core dot
uniform float uPass;        // 0 = combined, 1 = core only, 2 = halo only

varying vec3 vColor;
varying float vAlpha;
varying float vGlow;
varying float vCoreFrac;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float dist = length(uv);
  if (dist > 1.0) discard;

  // Fixed-size solid core, plus a soft faint halo spanning the whole sprite.
  float core = smoothstep(vCoreFrac, vCoreFrac * 0.8, dist);
  float halo = pow(max(0.0, 1.0 - dist), 3.0);

  // Halo only — the glow, accumulated into the half-float bloom buffer. Output is
  // premultiplied (rgb already times alpha) so the SAME output works for both
  // operators: the material's blend keeps src factor = One and only swaps the dst
  // factor — One for the dark additive glow, OneMinusSrcAlpha for the light
  // 'over' (= normal blending). Accumulating into a transparent buffer needs
  // premultiplied alpha to avoid dark fringing.
  if (uPass > 1.5) {
    float a = halo * uOpacity * vGlow * vAlpha;
    gl_FragColor = vec4(vColor * a, a);
    return;
  }

  float intensity;
  if (uPass > 0.5) {
    // Core only — the sharp data dot at full strength.
    intensity = core;
  } else {
    // Combined — the original single-pass look. The core is full strength;
    // uOpacity scales only the halo so a non-dimmed point keeps its true color.
    intensity = clamp(core + halo * uOpacity * vGlow * uGlowEnabled, 0.0, 1.0);
  }

  // Straight alpha; the material's blend mode decides how this composites.
  gl_FragColor = vec4(vColor, intensity * vAlpha);
}
`;
