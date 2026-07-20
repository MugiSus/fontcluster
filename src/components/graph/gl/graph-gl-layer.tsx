import { type Accessor } from 'solid-js';
import {
  type DendrogramArc,
  type DendrogramEdge,
  type DendrogramImageAnchor,
  type DendrogramNodeDot,
} from '@/components/graph/dendrogram-edges';
import {
  type GraphPointData,
  type GraphPointLabel,
  type GraphViewBox,
} from '@/components/graph/types';
import { type GraphLayout } from '@/components/graph/layouts/active-graph-layout';
import { useGraphGlRenderer } from './use-graph-gl-renderer';

interface GraphGlLayerProps {
  layout: Accessor<GraphLayout | null>;
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
  showPointCore: Accessor<boolean>;
  showTreemapBoundaries: Accessor<boolean>;
  dendrogramEdges: Accessor<DendrogramEdge[]>;
  dendrogramArcs: Accessor<DendrogramArc[]>;
  dendrogramNodeDots: Accessor<DendrogramNodeDot[]>;
  dendrogramImageAnchors: Accessor<DendrogramImageAnchor[]>;
  pointLabels: Accessor<GraphPointLabel[]>;
  dendrogramAncestry: Accessor<{ x: number; y: number }[]>;
  sessionKey: Accessor<string>;
  sampleImageUrl: (safeName: string) => string | undefined;
}

/**
 * GPU-rendered graph: hierarchy/scatter backplates, points + glow,
 * selection/hover/family rings and cluster-tinted sample images. Sits behind
 * the SVG, which owns interaction, coordinate transforms and the zoom overlay.
 */
export function GraphGlLayer(props: GraphGlLayerProps) {
  let canvas: HTMLCanvasElement | undefined;

  useGraphGlRenderer({
    getCanvas: () => canvas,
    layout: () => props.layout(),
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
    showPointCore: () => props.showPointCore(),
    showTreemapBoundaries: () => props.showTreemapBoundaries(),
    dendrogramEdges: () => props.dendrogramEdges(),
    dendrogramArcs: () => props.dendrogramArcs(),
    dendrogramNodeDots: () => props.dendrogramNodeDots(),
    dendrogramImageAnchors: () => props.dendrogramImageAnchors(),
    pointLabels: () => props.pointLabels(),
    dendrogramAncestry: () => props.dendrogramAncestry(),
    sessionKey: () => props.sessionKey(),
    sampleImageUrl: (safeName) => props.sampleImageUrl(safeName),
  });

  return (
    <canvas
      ref={(element) => (canvas = element)}
      class='pointer-events-none absolute left-0 top-0'
    />
  );
}
