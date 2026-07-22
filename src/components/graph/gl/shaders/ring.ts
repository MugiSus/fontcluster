// GLSL for the highlight rings (selection / hover / family). Each ring is a
// single quad carrying a signed-distance ring stroke, drawn normal-blended
// straight to the screen.
//
// The ring used to be a `Line2` polyline (64 segments). A polyline self-overlaps
// at every segment joint, so at opacity < 1 those joints double-blend and show up
// as a ring of brighter dots. A single SDF quad has no self-overlap, so the
// opacity applies uniformly across the whole stroke — the dim of a filtered-out
// font is a clean, even veil with no visible seams.
//
// `position` / projection uniforms are injected by three's ShaderMaterial.

/**
 * Draws the ring's bounding quad. The geometry is a PlaneGeometry(2, 2) whose
 * local coordinates span [-1, 1]; the mesh scale maps local 1.0 to {@link uHalfPx}
 * screen pixels, so the fragment shader can reason in pixel space directly.
 */
export const ringVertexShader = /* glsl */ `
varying vec2 vLocal;

void main() {
  vLocal = position.xy; // [-1, 1] before scale; 1.0 maps to uHalfPx screen px
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * A signed-distance ring stroke. The fragment's distance from the center in
 * screen pixels is `length(vLocal) * uHalfPx`; the stroke is the band a half-width
 * either side of {@link uRadiusPx}, anti-aliased with the screen-space derivative
 * so it stays a constant {@link uHalfWidthPx}-wide line at any zoom. Straight alpha
 * scaled by {@link uOpacity}; the material normal-blends it onto the screen, so a
 * dimmed ring is an even veil with no joint seams.
 */
export const ringFragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;     // whole-ring opacity (1 = active, < 1 = dimmed)
uniform float uHalfPx;      // screen px at the quad edge (ring radius + padding)
uniform float uRadiusPx;    // stroke centerline radius (screen px)
uniform float uHalfWidthPx; // half the stroke width (screen px)

varying vec2 vLocal;

void main() {
  float distPx = length(vLocal) * uHalfPx;
  float d = abs(distPx - uRadiusPx);      // distance to the stroke centerline
  float aa = fwidth(distPx);              // ~1 device px, for the anti-aliased edge
  float alpha = (1.0 - smoothstep(uHalfWidthPx - aa, uHalfWidthPx + aa, d)) * uOpacity;
  if (alpha <= 0.0) discard;
  gl_FragColor = vec4(uColor, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
