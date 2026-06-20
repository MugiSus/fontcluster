// GLSL for the graph point cloud. Each point is a screen-space-sized round
// sprite with a soft glowing falloff; the UnrealBloomPass downstream turns the
// bright cores into bloom. `position` / projection uniforms are injected by
// three's ShaderMaterial, so only the custom attributes are declared here.

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
  vGlow = dimmed ? 0.35 : 1.0;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = (dimmed ? uSizeDimmed : uSizeActive) * uPixelRatio;
}
`;

export const pointFragmentShader = /* glsl */ `
uniform float uLightMode;

varying vec3 vColor;
varying float vAlpha;
varying float vGlow;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float dist = dot(uv, uv);
  if (dist > 1.0) discard;

  float core = smoothstep(1.0, 0.05, dist);
  float halo = pow(1.0 - clamp(dist, 0.0, 1.0), 2.0);
  float intensity = clamp(core + halo * 0.6 * vGlow, 0.0, 1.0);

  if (uLightMode > 0.5) {
    // Subtractive ink on a light background: MultiplyBlending darkens the
    // white backdrop toward the cluster color, so overlaps build up density.
    vec3 ink = mix(vec3(1.0), vColor, intensity * vAlpha);
    gl_FragColor = vec4(ink, 1.0);
  } else {
    // Additive glow on a dark background.
    vec3 color = vColor * (0.55 + 0.85 * vGlow);
    gl_FragColor = vec4(color, intensity * vAlpha);
  }
}
`;
