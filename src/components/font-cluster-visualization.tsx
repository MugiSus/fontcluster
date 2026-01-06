import { For, createSignal, createEffect, createMemo } from 'solid-js';
import { emit } from '@tauri-apps/api/event';
import { FontMetadata, type FontWeight } from '../types/font';
import { WeightSelector } from './weight-selector';
import { FontVectorPoint } from './font-vector-point';
import { useElementSize } from '../hooks/use-element-size';
import { appState } from '../store';
import { setSelectedFontMetadata } from '../actions';

const GRAPH_PADDING = 100;
const GRAPH_SIZE = 1000;

// SVG ViewBox configuration
const INITIAL_VIEWBOX = {
  x: -GRAPH_PADDING,
  y: -GRAPH_PADDING,
  width: GRAPH_SIZE + GRAPH_PADDING * 2,
  height: GRAPH_SIZE + GRAPH_PADDING * 2,
};

const ZOOM_FACTOR_RATIO = 1.1;

export function FontClusterVisualization() {
  // SVG pan and zoom state
  const [viewBox, setViewBox] = createSignal(INITIAL_VIEWBOX);

  const { ref: svgRef, size: svgSize } = useElementSize<SVGSVGElement>();

  const zoomFactor = createMemo(() => {
    const minSide = Math.min(svgSize().width, svgSize().height);
    return viewBox().width / (minSide || INITIAL_VIEWBOX.width);
  });

  const [isDragging, setIsDragging] = createSignal(false);
  const [lastMousePos, setLastMousePos] = createSignal({ x: 0, y: 0 });

  // Internal visualizer weights management
  const [visualizerWeights, setVisualizerWeights] = createSignal<FontWeight[]>([
    400,
  ]);

  // Sync visualizer weights with session weights when they change
  createEffect(() => {
    const sessionWeights =
      (appState.session.config?.weights as FontWeight[]) || [];
    if (sessionWeights && sessionWeights.length > 0) {
      setVisualizerWeights(sessionWeights);
    }
  });

  const selectSelectedFont = (event: MouseEvent) => {
    const elements = document.elementsFromPoint(event.clientX, event.clientY);

    const nearFontElements = elements.filter((el) =>
      el.hasAttribute('data-font-select-area'),
    );

    if (nearFontElements.length === 0) {
      return;
    }

    let selectedFontMetadata = '';
    let nearestDistance = Infinity;

    nearFontElements.forEach((el) => {
      const circle = el as SVGCircleElement;
      const rect = circle.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.sqrt(
        (event.clientX - centerX) ** 2 + (event.clientY - centerY) ** 2,
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        selectedFontMetadata = circle.getAttribute('data-font-config') || '';
      }
    });

    if (selectedFontMetadata) {
      const selectedFontMetadataParse = JSON.parse(
        selectedFontMetadata,
      ) as FontMetadata;

      if (selectedFontMetadataParse) {
        setSelectedFontMetadata(selectedFontMetadataParse);
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
          emit('copy_family_name', {
            toast: false,
            isFontName: event.ctrlKey || event.metaKey,
          });
        }
        const elements = document.querySelectorAll(
          `[data-font-name="${selectedFontMetadataParse.safe_name}"] > img`,
        );
        elements.forEach((element) => {
          element.scrollIntoView({ behavior: 'instant', block: 'center' });
        });
      }
    }
  };

  const handleMouseMove = (event: MouseEvent) => {
    // Handle pan dragging
    if (isDragging() && event.buttons === 2) {
      const deltaX = event.clientX - lastMousePos().x;
      const deltaY = event.clientY - lastMousePos().y;

      const currentViewBox = viewBox();
      const { x, y, width, height } = currentViewBox;

      // Convert screen delta to SVG coordinates
      const svgElement = event.currentTarget as SVGElement;
      const rect = svgElement.getBoundingClientRect();
      const scaleX = width / Math.min(rect.width, rect.height);
      const scaleY = height / Math.min(rect.width, rect.height);

      const newX = x - deltaX * scaleX;
      const newY = y - deltaY * scaleY;

      setViewBox({ x: newX, y: newY, width, height });
      setLastMousePos({ x: event.clientX, y: event.clientY });
      return;
    }

    if (event.buttons === 0) return;

    selectSelectedFont(event);
  };

  const handleMouseDown = (event: MouseEvent) => {
    if (event.button === 2) {
      // Right click
      event.preventDefault();
      setIsDragging(true);
      setLastMousePos({ x: event.clientX, y: event.clientY });
    } else if (event.button === 0) {
      // Left click
      selectSelectedFont(event);
    }
  };

  const handleMouseUp = (event: MouseEvent) => {
    if (event.button === 2) {
      // Right click
      setIsDragging(false);
    }
  };

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();

    const svgElement = event.currentTarget as SVGElement;
    const rect = svgElement.getBoundingClientRect();

    // Get mouse position relative to SVG
    const mouseX =
      event.clientX - rect.left - Math.max(rect.width - rect.height, 0) / 2;
    const mouseY =
      event.clientY - rect.top - Math.max(rect.height - rect.width, 0) / 2;

    const currentViewBox = viewBox();
    const { x, y, width, height } = currentViewBox;

    // Convert mouse position to SVG coordinates
    const svgMouseX = x + (mouseX / Math.min(rect.width, rect.height)) * width;
    const svgMouseY = y + (mouseY / Math.min(rect.width, rect.height)) * height;

    // Zoom factor
    const zoomFactor =
      event.deltaY > 0 ? ZOOM_FACTOR_RATIO : 1 / ZOOM_FACTOR_RATIO;

    const newWidth = width * zoomFactor;
    const newHeight = height * zoomFactor;

    // Adjust position to zoom around mouse position
    const newX = svgMouseX - (svgMouseX - x) * zoomFactor;
    const newY = svgMouseY - (svgMouseY - y) * zoomFactor;

    setViewBox({ x: newX, y: newY, width: newWidth, height: newHeight });
  };

  const bounds = createMemo(() => {
    const vecs = Object.values(appState.fonts.data);
    if (vecs.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };

    const [minX, maxX] = vecs.reduce<[number, number]>(
      ([min, max], v) => {
        const x = v.computed?.vector[0] ?? 0;
        return [Math.min(min, x), Math.max(max, x)];
      },
      [Infinity, -Infinity],
    );
    const [minY, maxY] = vecs.reduce<[number, number]>(
      ([min, max], v) => {
        const y = v.computed?.vector[1] ?? 0;
        return [Math.min(min, y), Math.max(max, y)];
      },
      [Infinity, -Infinity],
    );

    return { minX, maxX, minY, maxY };
  });

  const allPoints = createMemo(() => {
    const vecs = Object.values(appState.fonts.data);
    const { minX, maxX, minY, maxY } = bounds();
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    return vecs.map((metadata) => {
      const vx = metadata.computed?.vector[0] ?? 0;
      const vy = metadata.computed?.vector[1] ?? 0;
      const x = ((vx - minX) / rangeX) * GRAPH_SIZE;
      const y = ((vy - minY) / rangeY) * GRAPH_SIZE;
      return {
        key: metadata.safe_name,
        metadata,
        x,
        y,
      };
    });
  });

  const visiblePoints = createMemo(() => {
    const vb = viewBox();
    const size = svgSize();
    const scale = zoomFactor();

    const visibleWidth = size.width * scale;
    const visibleHeight = size.height * scale;

    const padding = 50 * scale;
    const minVisibleX = vb.x + vb.width / 2 - visibleWidth / 2 - padding;
    const maxVisibleX = vb.x + vb.width / 2 + visibleWidth / 2 + padding;
    const minVisibleY = vb.y + vb.height / 2 - visibleHeight / 2 - padding;
    const maxVisibleY = vb.y + vb.height / 2 + visibleHeight / 2 + padding;

    const filteredKeys = appState.fonts.filteredKeys;
    const selectedFontName = appState.ui.selectedFont?.font_name;

    const visibleFilteredPoints = [];
    const visibleUnfilteredPoints = [];

    for (const point of allPoints()) {
      const isWeightIncluded = visualizerWeights().includes(
        point.metadata.weight as FontWeight,
      );
      const isVisible =
        point.x >= minVisibleX &&
        point.x <= maxVisibleX &&
        point.y >= minVisibleY &&
        point.y <= maxVisibleY;

      // Always render selected font
      const isSelected = point.metadata.font_name === selectedFontName;

      if (isWeightIncluded && (isVisible || isSelected)) {
        if (filteredKeys.has(point.key)) {
          visibleFilteredPoints.push(point);
        } else {
          visibleUnfilteredPoints.push(point);
        }
      }
    }

    return { visibleFilteredPoints, visibleUnfilteredPoints };
  });

  return (
    <div class='relative flex size-full items-center justify-center rounded-md border bg-muted/20'>
      <div class='absolute bottom-0 right-0 z-10 m-4 flex items-center justify-between'>
        <WeightSelector
          weights={(appState.session.config?.weights as FontWeight[]) || []}
          selectedWeights={visualizerWeights()}
          onWeightChange={setVisualizerWeights}
          isVertical
        />
      </div>
      <svg
        ref={svgRef}
        class='size-full select-none'
        viewBox={`${viewBox().x} ${viewBox().y} ${viewBox().width} ${viewBox().height}`}
        xmlns='http://www.w3.org/2000/svg'
        text-rendering='optimizeSpeed'
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <g>
          <path
            d='M 495 495 L 505 505 M 505 495 L 495 505'
            fill='none'
            stroke-width={zoomFactor() * 1}
            class='pointer-events-none stroke-muted'
          />
          <circle
            cx='500'
            cy='500'
            r='200'
            fill='none'
            stroke-width={zoomFactor() * 1}
            class='pointer-events-none stroke-muted'
          />
          <circle
            cx='500'
            cy='500'
            r='400'
            fill='none'
            stroke-width={zoomFactor() * 1}
            class='pointer-events-none stroke-muted'
          />
          <circle
            cx='500'
            cy='500'
            r='600'
            fill='none'
            stroke-width={zoomFactor() * 1}
            class='pointer-events-none stroke-muted'
          />
        </g>

        <g opacity={0.2}>
          <For each={visiblePoints().visibleUnfilteredPoints}>
            {(point) => (
              <FontVectorPoint
                fontName={point.metadata.font_name}
                weight={point.metadata.weight}
                clusterId={point.metadata.computed?.k}
                safeName={point.metadata.safe_name}
                x={point.x}
                y={point.y}
                isSelected={
                  appState.ui.selectedFont?.font_name ===
                  point.metadata.font_name
                }
                isFamilySelected={
                  appState.ui.selectedFont?.family_name ===
                  point.metadata.family_name
                }
                visualizerWeights={visualizerWeights()}
                zoomFactor={zoomFactor()}
                isDisabled
              />
            )}
          </For>
        </g>

        <For each={visiblePoints().visibleFilteredPoints}>
          {(point) => (
            <FontVectorPoint
              fontName={point.metadata.font_name}
              weight={point.metadata.weight}
              clusterId={point.metadata.computed?.k}
              safeName={point.metadata.safe_name}
              x={point.x}
              y={point.y}
              isSelected={
                appState.ui.selectedFont?.font_name === point.metadata.font_name
              }
              isFamilySelected={
                appState.ui.selectedFont?.family_name ===
                point.metadata.family_name
              }
              visualizerWeights={visualizerWeights()}
              zoomFactor={zoomFactor()}
            />
          )}
        </For>
      </svg>
    </div>
  );
}
