import { type Accessor } from 'solid-js';
import { type FontWeight } from '../../../types/font';
import {
  type GraphCoordinate,
  type GraphPointData,
  type GraphViewBox,
} from '../types';
import { useGraphGlRenderer } from './use-graph-gl-renderer';

interface GraphGlLayerProps {
  size: Accessor<{ width: number; height: number }>;
  viewBox: Accessor<GraphViewBox>;
  origin: Accessor<GraphCoordinate>;
  zoomFactor: Accessor<number>;
  points: Accessor<GraphPointData[]>;
  filteredKeys: Accessor<Set<string>>;
  activeWeights: Accessor<FontWeight[]>;
  selectedKey: Accessor<string | null>;
  hoveredKey: Accessor<string | null>;
  selectedFamily: Accessor<string | null>;
  imageKeys: Accessor<Set<string>>;
  showImages: Accessor<boolean>;
  glow: Accessor<boolean>;
  sessionDirectory: Accessor<string>;
}

/**
 * GPU-rendered graph: the origin axes, points + glow, selection/hover/family
 * rings and the cluster-tinted sample images. Sits behind the SVG, which now
 * only owns interaction, coordinate transforms and the lasso / zoom overlays.
 */
export function GraphGlLayer(props: GraphGlLayerProps) {
  let canvas: HTMLCanvasElement | undefined;

  useGraphGlRenderer({
    getCanvas: () => canvas,
    size: () => props.size(),
    viewBox: () => props.viewBox(),
    origin: () => props.origin(),
    zoomFactor: () => props.zoomFactor(),
    points: () => props.points(),
    filteredKeys: () => props.filteredKeys(),
    activeWeights: () => props.activeWeights(),
    selectedKey: () => props.selectedKey(),
    hoveredKey: () => props.hoveredKey(),
    selectedFamily: () => props.selectedFamily(),
    imageKeys: () => props.imageKeys(),
    showImages: () => props.showImages(),
    glow: () => props.glow(),
    sessionDirectory: () => props.sessionDirectory(),
  });

  return (
    <canvas
      ref={(element) => (canvas = element)}
      class='pointer-events-none absolute inset-0 size-full'
    />
  );
}
