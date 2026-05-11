import {
  For,
  Show,
  createEffect,
  createSelector,
  createSignal,
  onCleanup,
} from 'solid-js';
import { type FontWeight } from '../../types/font';
import { WeightSelector } from '../weight-selector';
import { ImageVisibilityToggle } from './image-visibility-toggle';
import { CircleSlash2Icon } from 'lucide-solid';
import { GraphPoint } from './point';
import { ZoomControls } from './zoom-controls';
import { useElementSize } from '../../hooks/use-element-size';
import { appState } from '../../store';
import { type GraphCoordinate } from './types';
import { useGraphPoints } from './use-graph-points';
import { useGraphSelection } from './use-graph-selection';
import { useGraphViewport } from './use-graph-viewport';

export function GraphContent() {
  const [showImages, setShowImages] = createSignal(true);
  const [showFontNames, setShowFontNames] = createSignal(true);
  const [graphWeights, setGraphWeights] = createSignal<FontWeight[]>([400]);
  const [mouseSelectionPoint, setMouseSelectionPoint] =
    createSignal<GraphCoordinate | null>(null);

  let svgElement: SVGSVGElement | undefined;
  let pendingMouseSelectionPoint: GraphCoordinate | null = null;
  let mouseSelectionAnimationFrame: number | undefined;
  const { ref: setSvgRef, size: svgSize } = useElementSize<SVGSVGElement>();

  createEffect(() => {
    const sessionWeights =
      (appState.session.config?.weights as FontWeight[]) || [];
    if (sessionWeights.length > 0) {
      setGraphWeights(sessionWeights);
    }
  });

  const viewport = useGraphViewport({
    getSvgElement: () => svgElement,
    svgSize,
  });
  const graph = useGraphPoints({
    graphWeights,
    svgSize,
    viewBox: viewport.viewBox,
    zoomFactor: viewport.zoomFactor,
    isMoving: viewport.isMoving,
  });
  const selection = useGraphSelection({
    getGraphPointFromEvent: viewport.getGraphPointFromEvent,
    getSelectionRadius: () => 40 * viewport.zoomFactor(),
    findSelectablePoint: graph.findSelectablePoint,
  });

  const isSelected = createSelector(() => appState.ui.selectedFontKey);
  const isFamilySelected = createSelector(() => appState.ui.selectedFontFamily);

  const queueMouseSelectionPoint = (point: GraphCoordinate | null) => {
    pendingMouseSelectionPoint = point;
    if (mouseSelectionAnimationFrame) return;

    mouseSelectionAnimationFrame = window.requestAnimationFrame(() => {
      setMouseSelectionPoint(pendingMouseSelectionPoint);
      mouseSelectionAnimationFrame = undefined;
    });
  };

  const updateMouseSelectionPoint = (event: MouseEvent) => {
    queueMouseSelectionPoint(viewport.getGraphPointFromEvent(event));
  };

  const hideMouseSelectionPoint = () => {
    queueMouseSelectionPoint(null);
  };

  onCleanup(() => {
    if (mouseSelectionAnimationFrame) {
      window.cancelAnimationFrame(mouseSelectionAnimationFrame);
    }
  });

  const handleMouseMove = (event: MouseEvent) => {
    if (event.buttons & 2) {
      hideMouseSelectionPoint();
      viewport.dragPan(event);
      return;
    }
    if (event.buttons & 1) {
      updateMouseSelectionPoint(event);
      selection.selectFromMouseEvent(event);
      return;
    }
    hideMouseSelectionPoint();
  };

  const handleMouseDown = (event: MouseEvent) => {
    if (event.buttons & 2) {
      hideMouseSelectionPoint();
      viewport.startPanDrag(event);
      return;
    }
    if (event.buttons & 1) {
      updateMouseSelectionPoint(event);
      selection.selectFromMouseEvent(event);
      return;
    }
  };

  const handleMouseUp = () => {
    hideMouseSelectionPoint();
    viewport.endPanDrag();
  };

  return (
    <div
      class='relative flex size-full items-center justify-center bg-background'
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={hideMouseSelectionPoint}
      onWheel={viewport.handleWheel}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Show
        when={graph.allPoints().length > 0}
        fallback={
          <div class='flex size-full flex-col items-center justify-center text-sm text-muted-foreground'>
            <CircleSlash2Icon class='mb-4 size-6' />
            <h2>No Results</h2>
            <p class='text-xs'>Complete processing to see results</p>
          </div>
        }
      >
        <div
          class='pointer-events-none absolute bottom-3 right-3 z-10 flex flex-col items-end gap-3 *:pointer-events-auto'
          onMouseDown={(event) => event.stopPropagation()}
        >
          <Show
            when={(
              (appState.session.config?.weights as FontWeight[]) || []
            ).join(',')}
            keyed
          >
            <WeightSelector
              weights={(appState.session.config?.weights as FontWeight[]) || []}
              defaultValue={
                (appState.session.config?.weights as FontWeight[]) || []
              }
              onChange={setGraphWeights}
              isVertical
            />
          </Show>
          <ImageVisibilityToggle
            showImages={showImages()}
            showFontNames={showFontNames()}
            onToggleImages={() => setShowImages(!showImages())}
            onToggleFontNames={() => setShowFontNames(!showFontNames())}
          />
          <ZoomControls
            onZoomIn={viewport.handleZoomIn}
            onZoomOut={viewport.handleZoomOut}
            onReset={viewport.handleReset}
          />
        </div>

        {/* <div class='pointer-events-none absolute bottom-3 left-3 z-10'>
          <Show when={appState.fonts.data[appState.ui.selectedFontKey || '']}>
            {(fontData) => (
              <div class='text-sm *:pointer-events-auto'>
                <p class='font-semibold'>{fontData().meta.font_name}</p>
                <p class='text-xs text-muted-foreground'>
                  Weight: {fontData().meta.weight}
                </p>
                <p class='text-xs text-muted-foreground'>
                  Family: {fontData().meta.family_name}
                </p>
              </div>
            )}
          </Show>
        </div> */}

        <svg
          ref={(el) => {
            svgElement = el;
            setSvgRef(el);
          }}
          class='size-full select-none'
          viewBox={`${viewport.viewBox().x} ${viewport.viewBox().y} ${viewport.viewBox().width} ${viewport.viewBox().height}`}
          xmlns='http://www.w3.org/2000/svg'
          text-rendering='optimizeSpeed'
        >
          <g>
            <path
              d='M 490 490 L 510 510 M 510 490 L 490 510'
              fill='none'
              stroke-width={viewport.zoomFactor() * 1}
              class='pointer-events-none stroke-border'
            />
            <circle
              cx='500'
              cy='500'
              r='200'
              fill='none'
              stroke-width={viewport.zoomFactor() * 1}
              class='pointer-events-none stroke-border'
            />
            <circle
              cx='500'
              cy='500'
              r='400'
              fill='none'
              stroke-width={viewport.zoomFactor() * 1}
              class='pointer-events-none stroke-border'
            />
            <circle
              cx='500'
              cy='500'
              r='600'
              fill='none'
              stroke-width={viewport.zoomFactor() * 1}
              class='pointer-events-none stroke-border'
            />
          </g>

          <g opacity={0.35}>
            <For each={graph.visiblePoints().visibleUnfilteredPoints}>
              {(point) => (
                <GraphPoint
                  fontName={point.item.meta.font_name}
                  weight={point.item.meta.weight}
                  clusterId={point.item.computed?.clustering?.k}
                  safeName={point.item.meta.safe_name}
                  x={point.x}
                  y={point.y}
                  isSelected={isSelected(point.key)}
                  isFamilySelected={isFamilySelected(
                    point.item.meta.family_name,
                  )}
                  sessionDirectory={appState.session.directory}
                  zoomFactor={viewport.zoomFactor()}
                  shouldShowImage={
                    showImages() &&
                    !viewport.isMoving() &&
                    graph.isImageVisible(point.key)
                  }
                  shouldShowFontName={false}
                  isDisabled
                />
              )}
            </For>
          </g>

          <For each={graph.visiblePoints().visibleFilteredPoints}>
            {(point) => (
              <GraphPoint
                fontName={point.item.meta.font_name}
                weight={point.item.meta.weight}
                clusterId={point.item.computed?.clustering?.k}
                safeName={point.item.meta.safe_name}
                x={point.x}
                y={point.y}
                isSelected={isSelected(point.key)}
                isFamilySelected={isFamilySelected(point.item.meta.family_name)}
                sessionDirectory={appState.session.directory}
                zoomFactor={viewport.zoomFactor()}
                shouldShowImage={
                  showImages() &&
                  !viewport.isMoving() &&
                  graph.isImageVisible(point.key)
                }
                shouldShowFontName={
                  showFontNames() &&
                  !viewport.isMoving() &&
                  graph.isImageVisible(point.key)
                }
              />
            )}
          </For>

          <Show when={mouseSelectionPoint()}>
            {(point) => (
              <g
                transform={`translate(${point().x}, ${point().y}) scale(${viewport.zoomFactor()})`}
              >
                <circle
                  cx={0}
                  cy={0}
                  r={40}
                  fill='transparent'
                  stroke='currentColor'
                  stroke-width={1.5}
                  stroke-dasharray='3 3'
                  stroke-dashoffset={0}
                >
                  <animate
                    attributeName='stroke-dashoffset'
                    from='0'
                    to='6'
                    dur='2000ms'
                    repeatCount='indefinite'
                  />
                </circle>
              </g>
            )}
          </Show>
        </svg>
      </Show>
    </div>
  );
}
