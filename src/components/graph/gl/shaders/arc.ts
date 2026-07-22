// GLSL for dendrogram arcs. Each arc is one instanced quad; the fragment shader
// evaluates the circular stroke analytically in graph space, so the base tree no
// longer tessellates arcs into many short line segments.

export const arcVertexShader = /* glsl */ `
uniform float uLineWidth;
uniform float uPad;
uniform float uZoom;

attribute vec2 instanceBoxCenter;
attribute vec2 instanceBoxHalfSize;
attribute vec2 instanceAngles;
attribute float instanceRadius;
attribute vec3 instanceColor;

varying vec2 vGraph;
varying vec2 vAngles;
varying float vRadius;
varying vec3 vColor;

void main() {
  vec2 halfSize = instanceBoxHalfSize + vec2((uLineWidth * 0.5 + uPad) * uZoom);
  vGraph = instanceBoxCenter + position.xy * halfSize;
  vAngles = instanceAngles;
  vRadius = instanceRadius;
  vColor = instanceColor;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(vGraph.x, -vGraph.y, 0.0, 1.0);
}
`;

export const arcFragmentShader = /* glsl */ `
uniform vec2 uCenter;
uniform float uLineWidth;
uniform float uOpacity;
uniform float uZoom;

varying vec2 vGraph;
varying vec2 vAngles;
varying float vRadius;
varying vec3 vColor;

const float TWO_PI = 6.283185307179586;

void main() {
  vec2 delta = vGraph - uCenter;
  float radial = length(delta);
  float angle = atan(delta.y, delta.x);
  float span = max(vAngles.y - vAngles.x, 0.0);
  float relative = mod(angle - vAngles.x + TWO_PI, TWO_PI);

  float distanceToArc = abs(radial - vRadius);
  if (relative > span) {
    float distanceToStart = min(relative, TWO_PI - relative);
    float distanceToEnd = relative - span;
    float endpointAngle = vAngles.x + ((distanceToStart < distanceToEnd) ? 0.0 : span);
    vec2 endpoint = uCenter + vec2(cos(endpointAngle), sin(endpointAngle)) * vRadius;
    distanceToArc = length(vGraph - endpoint);
  }

  float halfWidth = uLineWidth * 0.5 * uZoom;
  float coverage = clamp(
    (halfWidth - distanceToArc) / max(fwidth(distanceToArc), 1e-4) + 0.5,
    0.0,
    1.0
  );
  float alpha = coverage * uOpacity;
  if (alpha <= 0.0) discard;

  gl_FragColor = vec4(vColor, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
