// Base shaders for Troika's batched point labels. Troika derives its SDF and
// batching program from these, while the fragment shader decodes its untagged
// per-member RGB bytes into Three's selected linear working space.

export const pointLabelVertexShader = /* glsl */ `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const pointLabelFragmentShader = /* glsl */ `
uniform vec3 diffuse;
uniform float opacity;

void main() {
  vec3 encodedColor = min(diffuse * (256.0 / 255.0), vec3(1.0));
  gl_FragColor = vec4(
    sRGBTransferEOTF(vec4(encodedColor, 1.0)).rgb,
    opacity
  );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
