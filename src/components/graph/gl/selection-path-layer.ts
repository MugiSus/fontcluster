import { type Accessor, createEffect, indexArray, onCleanup } from 'solid-js';
import { Group, NormalBlending, type Object3D } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

const LINE_START_WIDTH_PX = 1;
const LINE_END_WIDTH_PX = 1;
const LINE_DURATION_MS = 250;

export interface SelectionPathSpec {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: number;
  startedAt: number;
}

export interface SelectionPathLayerProps {
  specs: Accessor<SelectionPathSpec[]>;
  resolution: Accessor<{ width: number; height: number }>;
  requestRender: () => void;
}

/**
 * Draws recent selection transitions as short path segments. The history and
 * coordinate specs are owned by useSelectionPathSpecs; this layer only mirrors
 * those specs into GPU objects, animates line length, and frees resources.
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
        linewidth: LINE_START_WIDTH_PX,
        transparent: true,
        depthTest: false,
        blending: NormalBlending,
      });
      const line = new Line2(geometry, material);
      line.frustumCulled = false;
      group.add(line);
      let animationFrameId: number | undefined;

      createEffect(() => {
        const current = spec();
        material.color.set(current.color);
        material.opacity = 1;

        if (animationFrameId !== undefined) {
          window.cancelAnimationFrame(animationFrameId);
        }

        const animateLength = () => {
          const progress = Math.min(
            1,
            (performance.now() - current.startedAt) / LINE_DURATION_MS,
          );
          const remaining = (1 - progress) ** 3;
          material.linewidth =
            LINE_END_WIDTH_PX +
            (LINE_START_WIDTH_PX - LINE_END_WIDTH_PX) * remaining;
          geometry.setPositions([
            current.toX + (current.fromX - current.toX) * remaining,
            current.toY + (current.fromY - current.toY) * remaining,
            0,
            current.toX,
            current.toY,
            0,
          ]);
          props.requestRender();

          if (progress < 1) {
            animationFrameId = window.requestAnimationFrame(animateLength);
          } else {
            animationFrameId = undefined;
          }
        };

        animateLength();
      });
      createEffect(() => {
        const { width, height } = props.resolution();
        if (width > 0 && height > 0) material.resolution.set(width, height);
      });

      onCleanup(() => {
        if (animationFrameId !== undefined) {
          window.cancelAnimationFrame(animationFrameId);
        }
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
