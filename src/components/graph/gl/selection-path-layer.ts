import { type Accessor, createEffect, indexArray, onCleanup } from 'solid-js';
import { Group, NormalBlending, type Object3D } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

const LINE_WIDTH_PX = 1;

export interface SelectionPathSpec {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: number;
  opacity: number;
}

export interface SelectionPathLayerProps {
  specs: Accessor<SelectionPathSpec[]>;
  resolution: Accessor<{ width: number; height: number }>;
  requestRender: () => void;
}

/**
 * Draws recent selection transitions as short path segments. The history itself
 * is owned by the renderer; this layer only mirrors the derived line specs into
 * GPU objects and frees them on teardown.
 */
export function createSelectionPathLayer(
  props: SelectionPathLayerProps,
): Object3D {
  const group = new Group();
  group.renderOrder = -0.5;

  const lines = indexArray(
    () => props.specs(),
    (spec) => {
      const geometry = new LineGeometry();
      const material = new LineMaterial({
        linewidth: LINE_WIDTH_PX,
        transparent: true,
        depthTest: false,
        blending: NormalBlending,
      });
      const line = new Line2(geometry, material);
      line.frustumCulled = false;
      group.add(line);

      createEffect(() => {
        const current = spec();
        geometry.setPositions([
          current.fromX,
          current.fromY,
          0,
          current.toX,
          current.toY,
          0,
        ]);
        material.color.set(current.color);
        material.opacity = current.opacity;
      });
      createEffect(() => {
        const { width, height } = props.resolution();
        if (width > 0 && height > 0) material.resolution.set(width, height);
      });

      onCleanup(() => {
        group.remove(line);
        geometry.dispose();
        material.dispose();
      });

      return line;
    },
  );

  createEffect(() => {
    lines();
    props.resolution();
    props.requestRender();
  });

  return group;
}
