// GLSL for the graph point cloud, split into two single-purpose programs:
//   - core: the sharp data dot, normal-blended straight to the screen.
//   - halo: the soft glow, premultiplied and accumulated into the half-float
//     bloom buffer (see GlowCompositor). The halo sprite scales by uGlowScale so
//     it keeps its on-screen size when the glow buffer is downscaled.
//
// Both programs share the same geometry (position / aColor / aState /
// aOpacity); the core additionally reads aHideCore to drop the dot where a
// sample image is drawn and uShowCore to disable every dot for layouts that do
// not need them (the halo ignores both, so the glow stays). The orchestrator
// still shows the core or halo points per render pass rather than switching a
// uPass uniform.
//
// `position` / projection uniforms are injected by three's ShaderMaterial, so
// only the custom attributes are declared here.

export const coreVertexShader = /* glsl */ `
attribute vec3 aColor;
attribute float aState;    // 0 = active, 1 = dimmed (filtered out / inactive weight)
attribute float aOpacity;  // extra per-point opacity multiplier
attribute float aHideCore; // 1 = core hidden (this sample's image is drawn)

uniform float uPixelRatio;
uniform float uCore; // solid core diameter (CSS px)
uniform float uShowCore; // 0 = hide every core dot, 1 = draw non-image cores

varying vec3 vColor;
varying float vAlpha;
varying float vCoreVisible;

void main() {
  bool dimmed = aState > 0.5;
  vColor = aColor;
  // Dimmed (filtered-out / inactive) points are 0.75x the size and much fainter.
  float scale = dimmed ? 0.75 : 1.0;
  vAlpha = (dimmed ? 0.2 : 1.0) * aOpacity;
  vCoreVisible = uShowCore * (1.0 - step(0.5, aHideCore));

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // WebGL may clamp zero-size points to its implementation minimum. Keep a
  // hidden point at one device pixel and let the fragment shader discard it
  // completely; the glow program ignores both core visibility inputs.
  gl_PointSize = vCoreVisible < 0.5 ? 1.0 : uCore * scale * uPixelRatio;
}
`;

export const coreFragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vCoreVisible;

void main() {
  if (vCoreVisible < 0.5) discard;
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float dist = length(uv);
  if (dist > 1.0) discard;

  // A soft-edged solid dot filling the (tiny) core sprite.
  float intensity = smoothstep(1.0, 0.8, dist);
  // Straight alpha; the material normal-blends this onto the screen.
  gl_FragColor = vec4(vColor, intensity * vAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const haloVertexShader = /* glsl */ `
attribute vec3 aColor;
attribute float aState;
attribute float aOpacity;

uniform float uPixelRatio;
uniform float uGlowScale; // glow-buffer scale (keeps on-screen size when downscaled)
uniform float uSize;      // blur / glow diameter (CSS px)

varying vec3 vColor;
varying float vAlpha;
varying float vGlow;

void main() {
  bool dimmed = aState > 0.5;
  vColor = aColor;
  float scale = dimmed ? 0.75 : 1.0;
  vAlpha = (dimmed ? 0.2 : 1.0) * aOpacity;
  vGlow = dimmed ? 0.2 : 1.0;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * scale * uPixelRatio * uGlowScale;
}
`;

export const haloFragmentShader = /* glsl */ `
uniform float uOpacity; // peak glow opacity at the center (it fades out from here)

varying vec3 vColor;
varying float vAlpha;
varying float vGlow;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float dist = length(uv);
  if (dist > 1.0) discard;

  float halo = pow(max(0.0, 1.0 - dist), 3.0);
  // Three converts the straight working-space color to the target first, then
  // premultiplies it for the halo buffer's One/OneMinusSrcAlpha blend.
  float a = halo * uOpacity * vGlow * vAlpha;
  gl_FragColor = vec4(vColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <premultiplied_alpha_fragment>
}
`;
