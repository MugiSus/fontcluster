import { Color, NormalBlending, ShaderMaterial, Vector2 } from 'three';
import { fatLineFragmentShader, fatLineVertexShader } from './shaders/line';

/** One CSS pixel outside the stroke for the shader's derivative AA ramp. */
const FAT_LINE_AA_PAD_PX = 1;

/** Shared in-shader-antialiased material for Line2 and LineSegments2. */
export function createFatLineMaterial(options: {
  color: number;
  linewidth: number;
  lineOffset?: number;
  opacity: number;
  hasVertexColors: boolean;
}): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      diffuse: { value: new Color(options.color) },
      opacity: { value: options.opacity },
      linewidth: { value: options.linewidth },
      aaPad: { value: FAT_LINE_AA_PAD_PX },
      lineoffset: { value: options.lineOffset ?? 0 },
      resolution: { value: new Vector2(1, 1) },
    },
    vertexShader: fatLineVertexShader,
    fragmentShader: fatLineFragmentShader,
    vertexColors: options.hasVertexColors,
    transparent: true,
    depthTest: false,
    blending: NormalBlending,
  });
}
