import { useFontList } from '@/components/list/use-font-list';
import { GraphListOverlay } from '@/components/list/graph-list-overlay';
import { Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { CircleSlash2Icon, LoaderIcon } from 'lucide-solid';
import { useI18n } from '@/i18n';
import { appState } from '@/store';
import { type FontItem, type RenderFontPreview } from '@/types/font';
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
  activeGraphLayout,
  dendrogramTreeLayout,
} from './layouts/active-graph-layout';
import {
  GRAPH_SIZE,
  SAMPLE_IMAGE_BOX_HEIGHT_PX,
  SAMPLE_IMAGE_BOX_WIDTH_PX,
} from './constants';
import { fontPoints, getGraphPointByKey } from './font-point-index';
import { GraphGlLayer } from './gl/graph-gl-layer';
import { SelectedFontActions } from './selected-font-actions';
import { SelectedFontPreview } from './selected-font-preview';
import {
  type CopySelectedFont,
  type GraphCoordinate,
  type GraphPointLabel,
  type GraphToolMode,
  type GraphVisibleBounds,
} from './types';
import { useGraphPoints } from './use-graph-points';
import { useGraphSelection } from './use-graph-selection';
import { useGraphViewport } from './use-graph-viewport';

const POINTER_DRAG_THRESHOLD_PX = 4;

export interface ViewportControls {
  handleWheel: (event: WheelEvent) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
}

interface GraphViewerProps {
  toolMode: GraphToolMode;
  showImages: boolean;
  showSamples: boolean;
  showFontNames: boolean;
  showGlow: boolean;
  showList: boolean;
  showHud: boolean;
  sessionKey: string;
  sampleImageUrl: (safeName: string) => string | undefined;
  copySelectedFont: CopySelectedFont;
  applySelectedFont?: ((item: FontItem) => Promise<void>) | undefined;
  renderFontPreview?: RenderFontPreview | undefined;
  onViewportControlsChange?: (controls: ViewportControls | null) => void;
}

export function GraphViewer(props: GraphViewerProps) {
  const { t } = useI18n();
  const [zoomBounds, setZoomBounds] = createSignal<GraphVisibleBounds | null>(
    null,
  );
  const [svgElement, setSvgElement] = createSignal<SVGSVGElement>();
  let zoomStartPoint: GraphCoordinate | null = null;
  let zoomStartScreenPoint: { x: number; y: number } | null = null;
  let isZoomStarted = false;

  const { ref: setSvgRef, size: svgSize } = useElementSize<SVGSVGElement>();
  const fontList = useFontList({
    size: svgSize,
    isVisible: () => props.showList && props.showHud,
  });
  const viewport = useGraphViewport({
    getSvgElement: svgElement,
    svgSize,
    graphWidth: () => activeGraphLayout()?.width ?? GRAPH_SIZE,
    graphHeight: () => activeGraphLayout()?.height ?? GRAPH_SIZE,
    resetCenter: () => {
      const layout = activeGraphLayout();
      return layout?.mode === 'scatter-plot' ? layout.origin : undefined;
    },
    resetZoom: () => (activeGraphLayout()?.mode === 'scatter-plot' ? 2.5 : 1),
    onViewportChange: (center) => selection.selectNearestPoint(center),
    onTouchTap: (event) => selection.selectFromMouseEvent(event),
  });
  const graph = useGraphPoints({
    svgSize,
    viewBox: viewport.viewBox,
    zoomFactor: viewport.zoomFactor,
    showImages: () => props.showImages,
    showFontNames: () => props.showFontNames,
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
    const halfWidth = (SAMPLE_IMAGE_BOX_WIDTH_PX / 2) * zoom;
    const halfHeight = (SAMPLE_IMAGE_BOX_HEIGHT_PX / 2) * zoom;
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
    findNearestSelectablePoint: graph.findNearestSelectablePoint,
    findDendrogramAnchor,
    findDendrogramPoint,
    copySelectedFont: (options) => props.copySelectedFont(options),
  });

  // Curve geometry only changes at half-octave zoom thresholds. Sampling uses
  // the lower world-per-pixel bound, so every bucket is conservative while
  // avoiding a full tree rebuild for every wheel event.
  const dendrogramCurveZoom = createMemo(() => {
    const zoom = viewport.zoomFactor();
    return zoom > 0 ? 2 ** (Math.floor(Math.log2(zoom) * 2) / 2) : 1;
  });
  const visibleDendrogramEdges = createMemo(() =>
    dendrogramEdges(dendrogramCurveZoom()),
  );
  const dendrogramAncestry = createMemo(() =>
    getDendrogramAncestry(selection.selectedKey(), dendrogramCurveZoom()),
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
  // toggle and the same screen-space thinning used by ordinary graph points.
  // This memo is the single source of the visible merge-node images: the GL
  // image layer draws exactly these, and image-box hit-testing resolves against
  // the same set. Dot hit-testing is independent so image-hidden nodes still
  // behave like selectable graph points.
  const dendrogramNodeImageAnchors = createMemo<DendrogramImageAnchor[]>(() => {
    if (!props.showImages) return [];
    const keys = graph.visibleDendrogramImageKeys();
    return dendrogramImageAnchors().filter((anchor) => keys.has(anchor.key));
  });

  // Tree labels follow their leaf layout; scatter labels sit below each point.
  const pointLabels = createMemo<GraphPointLabel[]>(() =>
    dendrogramTreeLayout()
      ? dendrogramLeafLabels()
      : fontPoints().map((point) => ({
          key: point.key,
          text: point.item.meta.font_name,
          x: point.x,
          y: point.y,
          orientation: 'horizontal' as const,
          colorAngle: point.colorAngle,
        })),
  );

  // When the selection came from a merge-node sample, the floating actions
  // anchor on that node's alias point instead of the represented font's ring
  // point.
  const getSelectedActionAnchorPoint = (key: string) => {
    const point = getGraphPointByKey(key);
    const anchor = selectedDendrogramAnchor();
    if (!point || !anchor) return point;
    return {
      ...point,
      x: anchor.x,
      y: anchor.y,
      colorAngle: anchor.colorAngle,
    };
  };

  // When a font is selected, the zoom buttons pivot around it instead of the
  // viewport center, keeping the current selection under the cursor as it grows
  // or shrinks. Falls back to center-based zoom when nothing is selected.
  const getZoomFocus = (): GraphCoordinate | undefined => {
    const key = selection.selectedKey();
    if (!key) return undefined;
    const point = getSelectedActionAnchorPoint(key);
    return point ? { x: point.x, y: point.y } : undefined;
  };

  onMount(() => {
    props.onViewportControlsChange?.({
      handleWheel: viewport.handleWheel,
      zoomIn: () => viewport.handleZoomIn(getZoomFocus()),
      zoomOut: () => viewport.handleZoomOut(getZoomFocus()),
      resetView: viewport.handleReset,
    });
  });

  onCleanup(() => {
    props.onViewportControlsChange?.(null);
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
          list={fontList}
          layout={activeGraphLayout}
          size={svgSize}
          viewBox={viewport.viewBox}
          zoomFactor={viewport.zoomFactor}
          points={fontPoints}
          getPointByKey={getGraphPointByKey}
          filteredKeys={() => appState.fonts.filteredKeys}
          selectedKey={selection.selectedKey}
          selectedDendrogramAnchor={selectedDendrogramAnchor}
          selectedFamily={selection.selectedFamilyName}
          visibleDetailKeys={graph.visibleDetailKeys}
          showImages={() => props.showImages}
          showFontNames={() => props.showFontNames}
          glow={() => props.showGlow}
          dendrogramEdges={visibleDendrogramEdges}
          dendrogramArcs={dendrogramArcs}
          dendrogramNodeDots={dendrogramNodeDots}
          dendrogramImageAnchors={dendrogramNodeImageAnchors}
          pointLabels={pointLabels}
          dendrogramAncestry={dendrogramAncestry}
          sessionKey={() => props.sessionKey}
          sampleImageUrl={props.sampleImageUrl}
        />
        <svg
          ref={(el) => {
            setSvgElement(el);
            setSvgRef(el);
          }}
          class='relative z-10 size-full touch-none select-none'
          onPointerDown={(event) => {
            if (event.pointerType === 'touch') event.preventDefault();
          }}
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

      <Show when={props.showHud && props.showList}>
        <GraphListOverlay list={fontList} />
      </Show>
      <Show when={props.showHud && props.showSamples}>
        <Show when={!appState.ui.isSessionLoading}>
          <SelectedFontPreview
            selectedKey={selection.selectedKey}
            renderFontPreview={props.renderFontPreview}
            viewBox={viewport.viewBox}
            size={svgSize}
            getPointByKey={getSelectedActionAnchorPoint}
          />
        </Show>
      </Show>
      <Show when={props.showHud}>
        <SelectedFontActions
          selectedKey={selection.selectedKey}
          isDragging={selection.isDragging}
          viewBox={viewport.viewBox}
          size={svgSize}
          getPointByKey={getSelectedActionAnchorPoint}
          copySelectedFont={props.copySelectedFont}
          applySelectedFont={props.applySelectedFont}
        />
      </Show>
      <Show when={graph.allPoints().length > 0 && viewport.isPanning()}>
        <svg
          class='pointer-events-none absolute left-1/2 top-1/2 z-50 size-8 -translate-x-1/2 -translate-y-1/2 text-muted-foreground'
          viewBox='0 0 32 32'
          fill='none'
          stroke='currentColor'
          stroke-width='1'
          aria-hidden='true'
        >
          <path d='M0 16H32M16 0V32' />
        </svg>
      </Show>
    </div>
  );
}
