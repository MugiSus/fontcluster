// GLSL for graph fat lines: a screen-space-width polyline shader that
// anti-aliases itself, matching this pipeline's in-shader-AA convention (see
// point-shaders.ts). It is a deliberately narrowed reimplementation of three's
// `LineMaterial` (three/examples/jsm/lines) covering only what the graph layers
// use — screen-space `linewidth`, round caps, optional per-segment vertex
// colors — so it can bake anti-aliasing in as a first-class step instead of
// patching three's built-in program through `onBeforeCompile`.
//
// The quad expansion mirrors `LineMaterial`'s non-world-units path exactly: each
// segment is an instanced box (`LineSegmentsGeometry` / `LineGeometry` supply
// `position` / `uv` and the `instanceStart/End` + `instanceColorStart/End`
// attributes), grown perpendicular to the screen-space segment direction by
// `linewidth`, with the box's end rows extended along the direction for the
// round caps. Two upstream branches are dropped on purpose:
//   - the perspective near-plane `trimSegment` — the graph renders through an
//     OrthographicCamera (see use-graph-gl-renderer), so `perspective` is always
//     false and that branch is dead;
//   - world-units, dashing, log-depth, clipping planes and fog — none are used.
//     Tone mapping and color-space output remain delegated to Three's chunks.
//
// `uv.x` runs across the stroke width (±1 at the edges); `uv.y` runs along the
// segment, exceeding ±1 only in the round-cap rows. `USE_COLOR` (set by the
// material's `vertexColors` flag) selects per-segment colors for the edges; the
// ancestry highlight leaves it off and takes the flat `diffuse` uniform.

export const fatLineVertexShader = /* glsl */ `
uniform float linewidth;
uniform float aaPad;
uniform float lineoffset;
uniform vec2 resolution;

attribute vec3 instanceStart;
attribute vec3 instanceEnd;

#ifdef USE_COLOR
  attribute vec3 instanceColorStart;
  attribute vec3 instanceColorEnd;
  varying vec3 vColor;
#endif

varying vec2 vUv;

void main() {
  #ifdef USE_COLOR
    // Rows below the box midline take the start vertex, the rest the end vertex.
    vColor = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;
  #endif

  vUv = uv;

  float aspect = resolution.x / resolution.y;

  // Segment endpoints in clip space (ortho: no near-plane trim needed).
  vec4 clipStart = projectionMatrix * modelViewMatrix * vec4( instanceStart, 1.0 );
  vec4 clipEnd = projectionMatrix * modelViewMatrix * vec4( instanceEnd, 1.0 );

  vec3 ndcStart = clipStart.xyz / clipStart.w;
  vec3 ndcEnd = clipEnd.xyz / clipEnd.w;

  // Screen-space segment direction (aspect-correct while normalizing).
  vec2 dir = ndcEnd.xy - ndcStart.xy;
  dir.x *= aspect;
  dir = normalize( dir );

  // Perpendicular offset, one expanded half-width to each side of the centerline.
  vec2 offset = vec2( dir.y, - dir.x );
  dir.x /= aspect;
  offset.x /= aspect;
  vec2 centerOffset = offset;

  if ( position.x < 0.0 ) offset *= - 1.0;

  // Round caps: extend the end rows of the box along the segment direction.
  if ( position.y < 0.0 ) {
    offset += - dir;
  } else if ( position.y > 1.0 ) {
    offset += dir;
  }

  // CSS-pixel width → clip space (÷ resolution.y, × clip.w after end select).
  // The extra pad leaves fragments outside the actual stroke for derivative AA.
  offset *= linewidth + 2.0 * aaPad;
  offset /= resolution.y;
  centerOffset *= 2.0 * lineoffset;
  centerOffset /= resolution.y;

  vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;
  offset *= clip.w;
  centerOffset *= clip.w;
  clip.xy += offset + centerOffset;

  gl_Position = clip;
}
`;

export const fatLineFragmentShader = /* glsl */ `
uniform vec3 diffuse;
uniform float opacity;
uniform float linewidth;
uniform float aaPad;

#ifdef USE_COLOR
  varying vec3 vColor;
#endif

varying vec2 vUv;

void main() {
  // This pipeline renders without MSAA, so fade alpha across a ~1px coverage
  // ramp at the stroke edge for in-shader anti-aliasing. edgeDistance is the
  // expanded-quad-normalized distance from the solid core — |vUv.x| along the body,
  // radial past the round caps where |vUv.y| > 1 — the same field the stock
  // LineMaterial only hard-discards on; here it feathers instead. The actual
  // stroke boundary is inside the padded quad at edgeRadius.
  float capExtent = max( abs( vUv.y ) - 1.0, 0.0 );
  float edgeDistance = length( vec2( vUv.x, capExtent ) );
  float edgeRadius = linewidth / ( linewidth + 2.0 * aaPad );
  float coverage = clamp(
    ( edgeRadius - edgeDistance ) / max( fwidth( edgeDistance ), 1e-4 ) + 0.5,
    0.0,
    1.0
  );

  float alpha = opacity * coverage;
  if ( alpha <= 0.0 ) discard;

  vec3 color = diffuse;
  #ifdef USE_COLOR
    color *= vColor;
  #endif

  // Straight alpha; the material normal-blends this onto the screen.
  gl_FragColor = vec4( color, alpha );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
