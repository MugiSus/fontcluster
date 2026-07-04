import { Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { polygonContains } from 'd3-polygon';
import { CircleSlash2Icon, LoaderIcon } from 'lucide-solid';
import { toast } from 'solid-sonner';
import { useI18n } from '@/i18n';
import { appState } from '@/store';
import { processLassoSelection } from '@/actions';
import { useElementSize } from '@/hooks/use-element-size';
import { type FontWeight } from '@/types/font';
import {
  type DendrogramImageAnchor,
  dendrogramEdges,
  dendrogramImageAnchors,
  dendrogramNodeDots,
  getDendrogramAncestry,
  getDendrogramAncestryImageAnchors,
} from './dendrogram-edges';
import {
  fontPoints,
  getGraphPointByKey,
  getGraphPointsByFamilyName,
  getSelectableFontPoints,
  getSelectableFontPointsInBounds,
  graphOrigin,
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
import { cn } from '@/lib/utils';

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
  showDendrogram: boolean;
  activeGraphWeights: FontWeight[];
  onViewportZoomControlsChange?: (
    controls: ViewportZoomControls | null,
  ) => void;
}

export function GraphViewer(props: GraphViewerProps) {
  const { t } = useI18n();
  const [lassoPoints, setLassoPoints] = createSignal<GraphCoordinate[]>([]);
  const [zoomBounds, setZoomBounds] = createSignal<GraphVisibleBounds | null>(
    null,
  );
  let svgElement: SVGSVGElement | undefined;
  let lassoStartPoint: { x: number; y: number } | null = null;
  let isLassoStarted = false;
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
    activeGraphWeights: () => props.activeGraphWeights,
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

  const selection = useGraphSelection({
    getGraphPointFromEvent: viewport.getGraphPointFromEvent,
    getSelectionRadius: () => 40 * viewport.zoomFactor(),
    findSelectablePoint: graph.findSelectablePoint,
    findDendrogramAnchor,
  });

  // The selected font's merge ancestry for the dendrogram mode.
  const dendrogramAncestry = createMemo(() =>
    props.showDendrogram ? getDendrogramAncestry(selection.selectedKey()) : [],
  );

  // Merge-node exemplar images for the dendrogram mode: the always-on reign
  // ends follow the images toggle, the selected font's ancestry handovers
  // show regardless (like the selected font's own image). Deduped by node,
  // ancestry last so its unconditional span wins. An anchor only survives
  // once its radial gap to the absorbing parent fits the image box at the
  // current zoom, so zooming in reveals finer merge stages — this memo is the
  // single source of the *visible* anchors: the GL image layer draws exactly
  // these, and the click hit-test resolves against the same set.
  const dendrogramNodeImageAnchors = createMemo<DendrogramImageAnchor[]>(() => {
    if (!props.showDendrogram) return [];
    const byNode = new Map<number, DendrogramImageAnchor>();
    if (props.showImages) {
      for (const anchor of dendrogramImageAnchors()) {
        byNode.set(anchor.nodeIndex, anchor);
      }
    }
    for (const anchor of getDendrogramAncestryImageAnchors(
      selection.selectedKey(),
    )) {
      byNode.set(anchor.nodeIndex, anchor);
    }
    const minSpan = BOX_HEIGHT_PX * viewport.zoomFactor();
    return [...byNode.values()].filter((anchor) => anchor.span >= minSpan);
  });

  // When the selection came from a merge-node sample, the floating actions
  // anchor on that node's sample instead of the represented font's ring point
  // (falling back to the ring point if the anchor is zoomed away).
  const getSelectedActionAnchorPoint = (key: string) => {
    const point = getGraphPointByKey(key);
    const nodeIndex = appState.ui.selectedDendrogramNode;
    if (!point || nodeIndex === null || !props.showDendrogram) return point;
    const anchor = dendrogramNodeImageAnchors().find(
      (candidate) => candidate.nodeIndex === nodeIndex,
    );
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

  const appendLassoPoint = (event: MouseEvent) => {
    const point = viewport.getGraphPointFromEvent(event);
    if (!point) return;

    setLassoPoints((points) => {
      const previous = points[points.length - 1];
      if (previous && previous.x === point.x && previous.y === point.y) {
        return points;
      }
      return [...points, point];
    });
  };

  const getLassoScreenDistance = (event: MouseEvent) => {
    if (!lassoStartPoint) return 0;
    return Math.hypot(
      event.clientX - lassoStartPoint.x,
      event.clientY - lassoStartPoint.y,
    );
  };

  const processLasso = () => {
    const points = lassoPoints();
    if (points.length < 3) return;

    const bounds = points.reduce(
      (acc, point) => ({
        minX: Math.min(acc.minX, point.x),
        maxX: Math.max(acc.maxX, point.x),
        minY: Math.min(acc.minY, point.y),
        maxY: Math.max(acc.maxY, point.y),
      }),
      {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
      },
    );
    const polygon = points.map(
      (point) => [point.x, point.y] as [number, number],
    );
    const selectedPoints = getSelectableFontPointsInBounds(bounds).filter(
      (point) => polygonContains(polygon, [point.x, point.y]),
    );
    if (selectedPoints.length === 0) return;

    const safeNames =
      props.toolMode === 'lasso-exclude'
        ? getSelectableFontPoints()
            .filter((point) => !polygonContains(polygon, [point.x, point.y]))
            .map((point) => point.key)
        : selectedPoints.map((point) => point.key);

    if (safeNames.length > 0) {
      processLassoSelection(safeNames).catch((error) => {
        console.error('Failed to process lasso selection:', error);
        toast.error(t.graph.toasts.lassoFailed({ error: String(error) }));
      });
    }
  };

  const clearLasso = () => {
    lassoStartPoint = null;
    isLassoStarted = false;
    setLassoPoints([]);
  };

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
      if (getLassoScreenDistance(event) > POINTER_DRAG_THRESHOLD_PX) {
        isLassoStarted = true;
      }
      appendLassoPoint(event);
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
        return;
      }
      lassoStartPoint = { x: event.clientX, y: event.clientY };
      isLassoStarted = false;
      setLassoPoints([]);
      appendLassoPoint(event);
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
    if (isLassoStarted) {
      appendLassoPoint(event);
      processLasso();
    } else if (getLassoScreenDistance(event) <= POINTER_DRAG_THRESHOLD_PX) {
      selection.selectFromMouseEvent(event);
    }
    clearLasso();
    viewport.endPanDrag();
  };

  return (
    <div
      class='relative flex size-full items-center justify-center bg-background'
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        clearLasso();
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
          origin={graphOrigin}
          zoomFactor={viewport.zoomFactor}
          points={fontPoints}
          getPointByKey={getGraphPointByKey}
          getPointsByFamilyName={getGraphPointsByFamilyName}
          filteredKeys={() => appState.fonts.filteredKeys}
          activeWeights={() => props.activeGraphWeights}
          selectedKey={selection.selectedKey}
          hoveredKey={() => appState.ui.hoveredFontKey}
          selectedFamily={selection.selectedFamilyName}
          imageKeys={graph.visibleImageKeys}
          showImages={() => props.showImages}
          glow={() => props.showGlow}
          dendrogramEdges={dendrogramEdges}
          dendrogramNodeDots={dendrogramNodeDots}
          dendrogramImageAnchors={dendrogramNodeImageAnchors}
          showDendrogram={() => props.showDendrogram}
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
              : props.toolMode === 'lasso-select'
                ? "url('/cursors/lasso-select.svg') 14 12, crosshair"
                : props.toolMode === 'lasso-exclude'
                  ? "url('/cursors/lasso-select-x.svg') 14 12, crosshair"
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
          <Show when={lassoPoints().length > 1}>
            <path
              d={`M ${lassoPoints()
                .map((point) => `${point.x} ${point.y}`)
                .join(' L ')}`}
              stroke='currentColor'
              stroke-width={1 * viewport.zoomFactor()}
              stroke-dasharray={`${6 * viewport.zoomFactor()} ${5 * viewport.zoomFactor()}`}
              fill-rule='evenodd'
              class={cn(
                'pointer-events-none',
                props.toolMode === 'lasso-exclude'
                  ? 'fill-destructive/5 stroke-destructive'
                  : 'fill-foreground/5 stroke-foreground',
              )}
            />
          </Show>

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
