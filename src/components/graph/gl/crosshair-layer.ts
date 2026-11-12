import { type Accessor, createEffect, onCleanup } from 'solid-js';
import { type Object3D } from 'three';
import { type LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { type GraphViewBox } from '@/components/graph/types';
import { getViewBoxCenter } from '@/components/graph/viewbox';
import { createFatLineMaterial } from './fat-line-material';

interface CrosshairLayerProps {
  getColor: () => string;
  showVertical: Accessor<boolean>;
  viewBox: Accessor<GraphViewBox>;
  zoomFactor: Accessor<number>;
  resolution: Accessor<{ width: number; height: number }>;
  requestRender: () => void;
}

/** Screen-centered guides, above the σ grid and below graph content. */
export function createCrosshairLayer(props: CrosshairLayerProps): Object3D {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions([-1, 0, 0, 1, 0, 0, 0, -1, 0, 0, 1, 0]);
  const material = createFatLineMaterial({
    color: 0xffffff,
    linewidth: 1,
    opacity: 1,
    hasVertexColors: false,
    hasRoundCaps: false,
  });
  const lines = new LineSegments2(
    geometry,
    material as unknown as LineMaterial,
  );
  lines.frustumCulled = false;
  lines.renderOrder = -0.55;

  // Kobalte publishes its theme signal before updating the DOM theme class.
  // Read the resolved CSS color at draw time, after those updates finish.
  // eslint-disable-next-line solid/reactivity -- Three's draw callback reads current DOM styling, not reactive state.
  lines.onBeforeRender = () => {
    material.uniforms['diffuse']!.value.setStyle(props.getColor());
  };

  createEffect(() => {
    const { width, height } = props.resolution();
    const center = getViewBoxCenter(props.viewBox());
    const zoom = props.zoomFactor();
    if (width <= 0 || height <= 0) return;

    // The first segment is horizontal; Three can draw just that instance.
    geometry.instanceCount = props.showVertical() ? 2 : 1;
    // Match the camera's xMidYMid meet framing, including letterboxed space.
    lines.position.set(center.x, -center.y, 0);
    lines.scale.set((width * zoom) / 2, (height * zoom) / 2, 1);
    material.uniforms['resolution']!.value.set(width, height);
    props.requestRender();
  });

  onCleanup(() => {
    geometry.dispose();
    material.dispose();
  });

  return lines;
}
