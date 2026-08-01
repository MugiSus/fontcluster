// Join-aware, one-sided polygon strokes for treemap cluster outlines and the
// outer frame. Each polygon is normalized to counter-clockwise render-space
// winding by the layer. The vertex shader intersects the two adjacent offset
// lines in screen space, so stroke width remains fixed in CSS pixels and an
// acute vertex cannot leak across either source edge. A bounded miter keeps a
// very narrow cell from producing an arbitrarily long inward join.

export const polygonStrokeVertexShader = /* glsl */ `
uniform vec2 resolution;

attribute vec3 previous;
attribute vec3 next;
attribute float offsetDirection;
attribute float offsetDistance;
attribute float coverage;

varying vec3 vColor;
varying float vCoverage;

void main() {
  vec4 clipPrevious = projectionMatrix * modelViewMatrix * vec4( previous, 1.0 );
  vec4 clipCurrent = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  vec4 clipNext = projectionMatrix * modelViewMatrix * vec4( next, 1.0 );

  vec2 screenPrevious = ( clipPrevious.xy / clipPrevious.w ) * resolution * 0.5;
  vec2 screenCurrent = ( clipCurrent.xy / clipCurrent.w ) * resolution * 0.5;
  vec2 screenNext = ( clipNext.xy / clipNext.w ) * resolution * 0.5;
  vec2 previousDirection = normalize( screenCurrent - screenPrevious );
  vec2 nextDirection = normalize( screenNext - screenCurrent );
  vec2 previousNormal = vec2( -previousDirection.y, previousDirection.x );
  vec2 nextNormal = vec2( -nextDirection.y, nextDirection.x );
  vec2 normalSum = previousNormal + nextNormal;
  vec2 miter = length( normalSum ) > 1e-5
    ? normalize( normalSum )
    : nextNormal;
  float miterScale = min(
    1.0 / max( dot( miter, nextNormal ), 1e-3 ),
    4.0
  );
  vec2 offsetPx = miter * offsetDistance * offsetDirection * miterScale;

  clipCurrent.xy += ( offsetPx * 2.0 / resolution ) * clipCurrent.w;
  gl_Position = clipCurrent;
  vColor = color;
  vCoverage = coverage;
}
`;

export const polygonStrokeFragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vCoverage;

void main() {
  float alpha = clamp( vCoverage, 0.0, 1.0 );
  if ( alpha <= 0.0 ) discard;

  gl_FragColor = vec4( vColor, alpha );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
