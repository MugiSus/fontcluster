import {
  For,
  Show,
  createEffect,
  createSelector,
  createSignal,
} from 'solid-js';
import { type FontWeight } from '../../types/font';
import { WeightSelector } from '../weight-selector';
import { ImageVisibilityToggle } from './image-visibility-toggle';
import { CircleSlash2Icon } from 'lucide-solid';
import { GraphPoint } from './point';
import { ZoomControls } from './zoom-controls';
import { useElementSize } from '../../hooks/use-element-size';
import { appState } from '../../store';
import { useGraphPoints } from './use-graph-points';
import { useGraphSelection } from './use-graph-selection';
import { useGraphViewport } from './use-graph-viewport';

export function GraphContent() {
  const [showImages, setShowImages] = createSignal(true);
  const [showFontNames, setShowFontNames] = createSignal(true);
  const [graphWeights, setGraphWeights] = createSignal<FontWeight[]>([400]);

  let svgElement: SVGSVGElement | undefined;
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

  const handleMouseMove = (event: MouseEvent) => {
    if (event.buttons & 2) {
      viewport.dragPan(event);
      return;
    }
    if (event.buttons & 1) {
      selection.selectFromMouseEvent(event);
      return;
    }
  };

  const handleMouseDown = (event: MouseEvent) => {
    if (event.buttons & 2) {
      viewport.startPanDrag(event);
      return;
    }
    if (event.buttons & 1) {
      selection.selectFromMouseEvent(event);
      return;
    }
  };

  const handleMouseUp = () => {
    viewport.endPanDrag();
  };

  return (
    <div
      class='relative flex size-full items-center justify-center bg-background'
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onWheel={viewport.handleWheel}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Show
        when={graph.allPoints().length > 0}
        fallback={
          <div class='flex size-full flex-col items-center justify-center bg-muted text-sm text-muted-foreground'>
            <CircleSlash2Icon class='mb-4 size-6' />
            <h2>No results found</h2>
            <p class='text-xs'>Complete processing to see results</p>
          </div>
        }
      >
        <div
          class='pointer-events-none absolute bottom-3 right-3 z-10 flex flex-col items-end gap-3 *:pointer-events-auto'
          onMouseDown={(event) => event.stopPropagation()}
        >
          <WeightSelector
            weights={(appState.session.config?.weights as FontWeight[]) || []}
            selectedWeights={graphWeights()}
            onWeightChange={setGraphWeights}
            isVertical
          />
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

          <g opacity={0.2}>
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
        </svg>
      </Show>
    </div>
  );
}
