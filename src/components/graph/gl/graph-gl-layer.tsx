import { type Accessor } from 'solid-js';
import { type GraphMode } from '@/store';
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
  type ScatterGridLine,
} from '@/components/graph/types';
import {
  type TreemapBoundary,
  type TreemapClusterRect,
  type TreemapLeafCell,
} from '@/components/graph/treemap-layout';
import { useGraphGlRenderer } from './use-graph-gl-renderer';

interface GraphGlLayerProps {
  graphMode: Accessor<GraphMode>;
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
  pointLabels: Accessor<GraphPointLabel[]>;
  scatterGridLines: Accessor<ScatterGridLine[]>;
  treemapCells: Accessor<TreemapLeafCell[]>;
  treemapBoundaries: Accessor<TreemapBoundary[]>;
  treemapClusterRects: Accessor<TreemapClusterRect[]>;
  dendrogramAncestry: Accessor<{ x: number; y: number }[]>;
  sessionDirectory: Accessor<string>;
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
    graphMode: () => props.graphMode(),
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
    pointLabels: () => props.pointLabels(),
    scatterGridLines: () => props.scatterGridLines(),
    treemapCells: () => props.treemapCells(),
    treemapBoundaries: () => props.treemapBoundaries(),
    treemapClusterRects: () => props.treemapClusterRects(),
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
