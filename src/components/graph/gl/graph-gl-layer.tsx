import { type Accessor } from 'solid-js';
import {
  type DendrogramArc,
  type DendrogramEdge,
  type DendrogramImageAnchor,
  type DendrogramLeafLabel,
  type DendrogramNodeDot,
} from '@/components/graph/dendrogram-edges';
import {
  type GraphPointData,
  type GraphViewBox,
} from '@/components/graph/types';
import { useGraphGlRenderer } from './use-graph-gl-renderer';

interface GraphGlLayerProps {
  size: Accessor<{ width: number; height: number }>;
  viewBox: Accessor<GraphViewBox>;
  zoomFactor: Accessor<number>;
  points: Accessor<GraphPointData[]>;
  getPointByKey: (key: string) => GraphPointData | undefined;
  getPointsByFamilyName: (familyName: string) => readonly GraphPointData[];
  filteredKeys: Accessor<Set<string>>;
  selectedKey: Accessor<string | null>;
  selectedDendrogramAnchor: Accessor<DendrogramImageAnchor | null>;
  hoveredKey: Accessor<string | null>;
  selectedFamily: Accessor<string | null>;
  imageKeys: Accessor<Set<string>>;
  showImages: Accessor<boolean>;
  showFontNames: Accessor<boolean>;
  glow: Accessor<boolean>;
  dendrogramEdges: Accessor<DendrogramEdge[]>;
  dendrogramArcs: Accessor<DendrogramArc[]>;
  dendrogramNodeDots: Accessor<DendrogramNodeDot[]>;
  dendrogramImageAnchors: Accessor<DendrogramImageAnchor[]>;
  dendrogramLeafLabels: Accessor<DendrogramLeafLabel[]>;
  dendrogramAncestry: Accessor<{ x: number; y: number }[]>;
  sessionDirectory: Accessor<string>;
}

/**
 * GPU-rendered graph: dendrogram edges, points + glow, selection/hover/family
 * rings and the cluster-tinted sample images. Sits behind the SVG, which owns
 * interaction, coordinate transforms and the zoom overlay.
 */
export function GraphGlLayer(props: GraphGlLayerProps) {
  let canvas: HTMLCanvasElement | undefined;

  useGraphGlRenderer({
    getCanvas: () => canvas,
    size: () => props.size(),
    viewBox: () => props.viewBox(),
    zoomFactor: () => props.zoomFactor(),
    points: () => props.points(),
    getPointByKey: (key) => props.getPointByKey(key),
    getPointsByFamilyName: (familyName) =>
      props.getPointsByFamilyName(familyName),
    filteredKeys: () => props.filteredKeys(),
    selectedKey: () => props.selectedKey(),
    selectedDendrogramAnchor: () => props.selectedDendrogramAnchor(),
    hoveredKey: () => props.hoveredKey(),
    selectedFamily: () => props.selectedFamily(),
    imageKeys: () => props.imageKeys(),
    showImages: () => props.showImages(),
    showFontNames: () => props.showFontNames(),
    glow: () => props.glow(),
    dendrogramEdges: () => props.dendrogramEdges(),
    dendrogramArcs: () => props.dendrogramArcs(),
    dendrogramNodeDots: () => props.dendrogramNodeDots(),
    dendrogramImageAnchors: () => props.dendrogramImageAnchors(),
    dendrogramLeafLabels: () => props.dendrogramLeafLabels(),
    dendrogramAncestry: () => props.dendrogramAncestry(),
    sessionDirectory: () => props.sessionDirectory(),
  });

  return (
    <canvas
      ref={(element) => (canvas = element)}
      class='pointer-events-none absolute inset-0 size-full'
    />
  );
}
