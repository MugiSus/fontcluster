import { type FontListController } from '@/components/list/use-font-list';
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
  list: FontListController;
  layout: Accessor<GraphLayout | null>;
  size: Accessor<{ width: number; height: number }>;
  viewBox: Accessor<GraphViewBox>;
  zoomFactor: Accessor<number>;
  points: Accessor<GraphPointData[]>;
  getPointByKey: (key: string) => GraphPointData | undefined;
  filteredKeys: Accessor<Set<string>>;
  selectedKey: Accessor<string | null>;
  selectedDendrogramAnchor: Accessor<DendrogramImageAnchor | null>;
  selectedFamily: Accessor<string | null>;
  visibleDetailKeys: Accessor<Set<string>>;
  showImages: Accessor<boolean>;
  showFontNames: Accessor<boolean>;
  glow: Accessor<boolean>;
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
 * selection/family rings and cluster-tinted sample images. Sits behind
 * the SVG, which owns interaction, coordinate transforms and the zoom overlay.
 */
export function GraphGlLayer(props: GraphGlLayerProps) {
  let canvas: HTMLCanvasElement | undefined;

  useGraphGlRenderer({
    getCanvas: () => canvas,
    get list() {
      return props.list;
    },
    layout: () => props.layout(),
    size: () => props.size(),
    viewBox: () => props.viewBox(),
    zoomFactor: () => props.zoomFactor(),
    points: () => props.points(),
    getPointByKey: (key) => props.getPointByKey(key),
    filteredKeys: () => props.filteredKeys(),
    selectedKey: () => props.selectedKey(),
    selectedDendrogramAnchor: () => props.selectedDendrogramAnchor(),
    selectedFamily: () => props.selectedFamily(),
    visibleDetailKeys: () => props.visibleDetailKeys(),
    showImages: () => props.showImages(),
    showFontNames: () => props.showFontNames(),
    glow: () => props.glow(),
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
      class='pointer-events-none absolute top-0 left-0 text-muted-foreground'
    />
  );
}
