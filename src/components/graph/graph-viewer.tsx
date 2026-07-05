import { Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { CircleSlash2Icon, LoaderIcon } from 'lucide-solid';
import { useI18n } from '@/i18n';
import { appState } from '@/store';
import { useElementSize } from '@/hooks/use-element-size';
import {
  dendrogramArcs,
  type DendrogramImageAnchor,
  dendrogramEdges,
  dendrogramImageAnchors,
  dendrogramLeafLabels,
  dendrogramNodeDots,
  getDendrogramAncestry,
} from './dendrogram-edges';
import {
  fontPoints,
  getGraphPointByKey,
  getGraphPointsByFamilyName,
} from './font-point-index';
import { GraphGlLayer } from './gl/graph-gl-layer';
import { BOX_HEIGHT_PX, BOX_WIDTH_PX } from './gl/image-layer';
import { SelectedFontActions } from './selected-font-actions';
import {
  type GraphCoordinate,
  type GraphToolMode,
  type GraphVisibleBounds,
} from './types';
import { useGraphPoints } from './use-graph-points';
import { useGraphSelection } from './use-graph-selection';
import { useGraphViewport } from './use-graph-viewport';

const POINTER_DRAG_THRESHOLD_PX = 4;

export interface ViewportZoomControls {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
}

interface GraphViewerProps {
  toolMode: GraphToolMode;
  showImages: boolean;
  showFontNames: boolean;
  showGlow: boolean;
  onViewportZoomControlsChange?: (
    controls: ViewportZoomControls | null,
  ) => void;
}

export function GraphViewer(props: GraphViewerProps) {
  const { t } = useI18n();
  const [zoomBounds, setZoomBounds] = createSignal<GraphVisibleBounds | null>(
    null,
  );
  let svgElement: SVGSVGElement | undefined;
  let zoomStartPoint: GraphCoordinate | null = null;
  let zoomStartScreenPoint: { x: number; y: number } | null = null;
  let isZoomStarted = false;

  const { ref: setSvgRef, size: svgSize } = useElementSize<SVGSVGElement>();
  const viewport = useGraphViewport({
    getSvgElement: () => svgElement,
    svgSize,
  });
  const graph = useGraphPoints({
    svgSize,
    viewBox: viewport.viewBox,
    zoomFactor: viewport.zoomFactor,
    isMoving: viewport.isMoving,
  });
  // Hit-test for the merge-node samples: the image box around each visible
  // anchor (the same set the GL layer draws — see the memo below), nearest
  // centre winning. Referenced before the memo's declaration, but only ever
  // called from mouse events, well after setup.
  const findDendrogramAnchor = (
    x: number,
    y: number,
  ): DendrogramImageAnchor | null => {
    const zoom = viewport.zoomFactor();
    const halfWidth = (BOX_WIDTH_PX / 2) * zoom;
    const halfHeight = (BOX_HEIGHT_PX / 2) * zoom;
    let nearest: DendrogramImageAnchor | null = null;
    let nearestDistance = Infinity;
    for (const anchor of dendrogramNodeImageAnchors()) {
      const dx = x - anchor.x;
      const dy = y - anchor.y;
      if (Math.abs(dx) > halfWidth || Math.abs(dy) > halfHeight) continue;
      const distance = Math.hypot(dx, dy);
      if (distance < nearestDistance) {
        nearest = anchor;
        nearestDistance = distance;
      }
    }
    return nearest;
  };

  const findDendrogramPoint = (
    x: number,
    y: number,
    radius: number,
  ): DendrogramImageAnchor | null => {
    return graph.findSelectableDendrogramPoint(x, y, radius);
  };

  const selection = useGraphSelection({
    getGraphPointFromEvent: viewport.getGraphPointFromEvent,
    getSelectionRadius: () => 40 * viewport.zoomFactor(),
    findSelectablePoint: graph.findSelectablePoint,
    findDendrogramAnchor,
    findDendrogramPoint,
  });

  const dendrogramAncestry = createMemo(() =>
    getDendrogramAncestry(selection.selectedKey()),
  );

  const selectedDendrogramAnchor = createMemo<DendrogramImageAnchor | null>(
    () => {
      const nodeIndex = selection.selectedDendrogramNode();
      if (nodeIndex === null) return null;
      return (
        dendrogramImageAnchors().find(
          (candidate) => candidate.nodeIndex === nodeIndex,
        ) ?? null
      );
    },
  );

  // Merge-node exemplar images for the dendrogram mode, following the images
  // toggle and the same hex-grid image thinning used by ordinary graph points.
  // This memo is the single source of the visible merge-node images: the GL
  // image layer draws exactly these, and image-box hit-testing resolves against
  // the same set. A selected alias remains visible like a selected ordinary
  // graph point. Dot hit-testing is independent so image-hidden nodes still
  // behave like selectable graph points.
  const dendrogramNodeImageAnchors = createMemo<DendrogramImageAnchor[]>(() => {
    const anchors = new Map<string, DendrogramImageAnchor>();
    if (props.showImages) {
      const keys = graph.visibleDendrogramImageKeys();
      for (const anchor of dendrogramImageAnchors()) {
        if (keys.has(anchor.key)) anchors.set(anchor.key, anchor);
      }
    }
    const selectedAnchor = selectedDendrogramAnchor();
    if (selectedAnchor) anchors.set(selectedAnchor.key, selectedAnchor);
    return [...anchors.values()];
  });

  // When the selection came from a merge-node sample, the floating actions
  // anchor on that node's alias point instead of the represented font's ring
  // point.
  const getSelectedActionAnchorPoint = (key: string) => {
    const point = getGraphPointByKey(key);
    const anchor = selectedDendrogramAnchor();
    if (!point || !anchor) return point;
    return anchor ? { ...point, x: anchor.x, y: anchor.y } : point;
  };

  onMount(() => {
    props.onViewportZoomControlsChange?.({
      zoomIn: viewport.handleZoomIn,
      zoomOut: viewport.handleZoomOut,
      resetView: viewport.handleReset,
    });
  });

  onCleanup(() => {
    props.onViewportZoomControlsChange?.(null);
  });

  const clearZoom = () => {
    zoomStartPoint = null;
    zoomStartScreenPoint = null;
    isZoomStarted = false;
    setZoomBounds(null);
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (event.buttons === 4) {
      viewport.dragPan(event);
      return;
    }
    if (event.buttons === 1) {
      if (props.toolMode === 'drag') {
        viewport.dragPan(event);
        return;
      }
      if (props.toolMode === 'zoom') {
        if (
          zoomStartScreenPoint &&
          Math.hypot(
            event.clientX - zoomStartScreenPoint.x,
            event.clientY - zoomStartScreenPoint.y,
          ) > POINTER_DRAG_THRESHOLD_PX
        ) {
          isZoomStarted = true;
        }
        if (!isZoomStarted) return;
        if (!zoomStartPoint) return;

        const point = viewport.getGraphPointFromEvent(event);
        if (!point) return;

        setZoomBounds({
          minX: Math.min(zoomStartPoint.x, point.x),
          maxX: Math.max(zoomStartPoint.x, point.x),
          minY: Math.min(zoomStartPoint.y, point.y),
          maxY: Math.max(zoomStartPoint.y, point.y),
        });
        return;
      }
      if (props.toolMode === 'select') {
        selection.trackDraggingSelection(event);
        return;
      }
    }
  };

  const handleMouseDown = (event: MouseEvent) => {
    // Measure the SVG rect once per interaction so the per-move coordinate math
    // stays reflow-free.
    viewport.refreshViewportRect();
    if (event.button === 1) {
      selection.clearDraggingSelection();
      viewport.startPanDrag(event);
      return;
    }
    if (event.button === 2 && props.toolMode === 'zoom') {
      selection.clearDraggingSelection();
      zoomStartPoint = viewport.getGraphPointFromEvent(event);
      zoomStartScreenPoint = { x: event.clientX, y: event.clientY };
      isZoomStarted = false;
      setZoomBounds(null);
      return;
    }
    if (event.button === 0) {
      if (props.toolMode === 'drag') {
        selection.clearDraggingSelection();
        viewport.startPanDrag(event);
        return;
      }
      if (props.toolMode === 'zoom') {
        selection.clearDraggingSelection();
        zoomStartPoint = viewport.getGraphPointFromEvent(event);
        zoomStartScreenPoint = { x: event.clientX, y: event.clientY };
        isZoomStarted = false;
        setZoomBounds(null);
        return;
      }
      if (props.toolMode === 'select') {
        selection.trackDraggingSelection(event);
      }
    }
  };

  const handleMouseUp = (event: MouseEvent) => {
    if (event.button === 1) {
      viewport.endPanDrag();
      return;
    }
    if (props.toolMode === 'zoom' && event.button === 2) {
      if (
        zoomStartPoint &&
        zoomStartScreenPoint &&
        Math.hypot(
          event.clientX - zoomStartScreenPoint.x,
          event.clientY - zoomStartScreenPoint.y,
        ) <= POINTER_DRAG_THRESHOLD_PX
      ) {
        viewport.handleZoomOut(zoomStartPoint);
      }
      clearZoom();
      return;
    }
    if (event.button === 2) {
      return;
    }
    if (props.toolMode === 'drag') {
      viewport.endPanDrag();
      return;
    }
    if (props.toolMode === 'zoom') {
      const bounds = zoomBounds();
      if (isZoomStarted && bounds) {
        viewport.zoomToBounds(bounds);
      } else if (event.button === 0 && zoomStartPoint) {
        viewport.handleZoomIn(zoomStartPoint);
      }
      clearZoom();
      viewport.endPanDrag();
      return;
    }
    if (props.toolMode === 'select') {
      if (event.button === 0) {
        selection.selectFromMouseEvent(event);
      }
      viewport.endPanDrag();
      return;
    }
    viewport.endPanDrag();
  };

  return (
    <div
      class='relative flex size-full items-center justify-center bg-background'
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        clearZoom();
        selection.clearDraggingSelection();
        viewport.endPanDrag();
      }}
      onWheel={viewport.handleWheel}
      onContextMenu={(event) => event.preventDefault()}
      onAuxClick={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
    >
      <Show
        when={graph.allPoints().length > 0}
        fallback={
          <Show
            when={appState.ui.isSessionLoading}
            fallback={
              <div class='flex size-full flex-col items-center justify-center text-sm text-muted-foreground'>
                <CircleSlash2Icon class='mb-4 size-6' />
                <h2>{t.graph.emptyState.title()}</h2>
                <p class='text-xs'>{t.graph.emptyState.hint()}</p>
              </div>
            }
          >
            <div class='flex size-full items-center justify-center'>
              <LoaderIcon
                class='size-8 animate-spin text-muted-foreground'
                stroke-width={1}
              />
            </div>
          </Show>
        }
      >
        <GraphGlLayer
          size={svgSize}
          viewBox={viewport.viewBox}
          zoomFactor={viewport.zoomFactor}
          points={fontPoints}
          getPointByKey={getGraphPointByKey}
          getPointsByFamilyName={getGraphPointsByFamilyName}
          filteredKeys={() => appState.fonts.filteredKeys}
          selectedKey={selection.selectedKey}
          selectedDendrogramAnchor={selectedDendrogramAnchor}
          hoveredKey={() => appState.ui.hoveredFontKey}
          selectedFamily={selection.selectedFamilyName}
          imageKeys={graph.visibleImageKeys}
          showImages={() => props.showImages}
          showFontNames={() => props.showFontNames}
          glow={() => props.showGlow}
          dendrogramEdges={dendrogramEdges}
          dendrogramArcs={dendrogramArcs}
          dendrogramNodeDots={dendrogramNodeDots}
          dendrogramImageAnchors={dendrogramNodeImageAnchors}
          dendrogramLeafLabels={dendrogramLeafLabels}
          dendrogramAncestry={dendrogramAncestry}
          sessionDirectory={() => appState.sessionDirectory}
        />
        <svg
          ref={(el) => {
            svgElement = el;
            setSvgRef(el);
          }}
          class='relative z-10 size-full select-none'
          style={{
            cursor: viewport.isDragging()
              ? "url('/cursors/hand-grab.svg') 12 12, grabbing"
              : props.toolMode === 'drag'
                ? "url('/cursors/hand.svg') 12 12, grab"
                : props.toolMode === 'zoom'
                  ? "url('/cursors/zoom-in.svg') 11 11, zoom-in"
                  : "url('/cursors/mouse-pointer-2.svg') 4 4, default",
          }}
          viewBox={`${viewport.viewBox().x} ${viewport.viewBox().y} ${viewport.viewBox().width} ${viewport.viewBox().height}`}
          xmlns='http://www.w3.org/2000/svg'
          text-rendering='optimizeSpeed'
        >
          <Show when={zoomBounds()}>
            {(bounds) => (
              <rect
                x={bounds().minX}
                y={bounds().minY}
                width={bounds().maxX - bounds().minX}
                height={bounds().maxY - bounds().minY}
                stroke='currentColor'
                stroke-width={1 * viewport.zoomFactor()}
                stroke-dasharray={`${6 * viewport.zoomFactor()} ${5 * viewport.zoomFactor()}`}
                class='pointer-events-none fill-foreground/5 stroke-foreground'
              />
            )}
          </Show>
        </svg>
      </Show>

      <SelectedFontActions
        selectedKey={selection.selectedKey}
        isSelecting={selection.isSelecting}
        viewBox={viewport.viewBox}
        size={svgSize}
        getPointByKey={getSelectedActionAnchorPoint}
      />
    </div>
  );
}
