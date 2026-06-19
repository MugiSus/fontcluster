import { type Accessor } from 'solid-js';
import { type FontWeight } from '../../../types/font';
import { type GraphPointData, type GraphViewBox } from '../types';
import { useGraphGlRenderer } from './use-graph-gl-renderer';

interface GraphGlLayerProps {
  size: Accessor<{ width: number; height: number }>;
  viewBox: Accessor<GraphViewBox>;
  points: Accessor<GraphPointData[]>;
  filteredKeys: Accessor<Set<string>>;
  activeWeights: Accessor<FontWeight[]>;
}

/**
 * GPU-rendered point cloud for the graph. Sits behind the SVG overlay, which
 * keeps owning interaction, coordinate transforms and the rich per-point
 * decorations (images, labels, selection rings).
 */
export function GraphGlLayer(props: GraphGlLayerProps) {
  let canvas: HTMLCanvasElement | undefined;

  useGraphGlRenderer({
    getCanvas: () => canvas,
    size: () => props.size(),
    viewBox: () => props.viewBox(),
    points: () => props.points(),
    filteredKeys: () => props.filteredKeys(),
    activeWeights: () => props.activeWeights(),
  });

  return (
    <canvas
      ref={(element) => (canvas = element)}
      class='pointer-events-none absolute inset-0 size-full'
    />
  );
}
