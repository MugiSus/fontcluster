import { For, createSignal, createEffect, createMemo } from 'solid-js';
import { emit } from '@tauri-apps/api/event';
import { FontConfigRecord, FontConfig, type FontWeight } from '../types/font';
import { WeightSelector } from './weight-selector';
import { FontVectorPoint } from './font-vector-point';

// SVG ViewBox configuration
const INITIAL_VIEWBOX = {
  x: -50,
  y: -50,
  width: 700,
  height: 700,
};

const ZOOM_FACTOR = 1.1;

interface FontClusterVisualizationProps {
  fontConfigRecord: FontConfigRecord | undefined;
  nearestFontConfig: FontConfig | null;
  sessionWeights: FontWeight[];
  onFontSelect: (safeName: FontConfig) => void;
}

export function FontClusterVisualization(props: FontClusterVisualizationProps) {
  // SVG pan and zoom state
  const [viewBox, setViewBox] = createSignal(INITIAL_VIEWBOX);

  const vectors = createMemo(() => Object.values(props.fontConfigRecord || {}));
  const zoomFactor = createMemo(() => viewBox().width / 700);

  const [isDragging, setIsDragging] = createSignal(false);
  const [lastMousePos, setLastMousePos] = createSignal({ x: 0, y: 0 });

  // Internal visualizer weights management
  const [visualizerWeights, setVisualizerWeights] = createSignal<FontWeight[]>([
    400,
  ]);

  // Sync visualizer weights with session weights when they change
  createEffect(() => {
    const sessionWeights = props.sessionWeights;
    if (sessionWeights && sessionWeights.length > 0) {
      setVisualizerWeights(sessionWeights);
    }
  });

  const selectNearestFont = (event: MouseEvent) => {
    const elements = document.elementsFromPoint(event.clientX, event.clientY);

    const fontElements = elements.filter((el) =>
      el.hasAttribute('data-font-select-area'),
    );

    if (fontElements.length === 0) {
      return;
    }

    let nearestFontConfig = null;
    let nearestDistance = Infinity;

    fontElements.forEach((el) => {
      const circle = el as SVGCircleElement;
      const rect = circle.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.sqrt(
        (event.clientX - centerX) ** 2 + (event.clientY - centerY) ** 2,
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestFontConfig = circle.getAttribute('data-font-config') || '';
      }
    });

    if (nearestFontConfig) {
      const nearestFontConfigParse = JSON.parse(
        nearestFontConfig,
      ) as FontConfig;

      if (nearestFontConfigParse) {
        props.onFontSelect(nearestFontConfigParse);
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
          emit('copy_family_name', {
            toast: false,
            isFontName: event.ctrlKey || event.metaKey,
          });
        }
        const elements = document.querySelectorAll(
          `[data-font-name="${nearestFontConfigParse.safe_name}"] > img`,
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

    selectNearestFont(event);
  };

  const handleMouseDown = (event: MouseEvent) => {
    if (event.button === 2) {
      // Right click
      event.preventDefault();
      setIsDragging(true);
      setLastMousePos({ x: event.clientX, y: event.clientY });
    } else if (event.button === 0) {
      // Left click
      selectNearestFont(event);
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
    const zoomFactor = event.deltaY > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;

    const newWidth = width * zoomFactor;
    const newHeight = height * zoomFactor;

    // Adjust position to zoom around mouse position
    const newX = svgMouseX - (svgMouseX - x) * zoomFactor;
    const newY = svgMouseY - (svgMouseY - y) * zoomFactor;

    setViewBox({ x: newX, y: newY, width: newWidth, height: newHeight });
  };

  const bounds = createMemo(() => {
    const vecs = vectors();
    if (vecs.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };

    const [minX, maxX] = vecs.reduce(
      ([min, max], v) => {
        const x = v.computed?.vector[0] ?? 0;
        return [Math.min(min, x), Math.max(max, x)];
      },
      [Infinity, -Infinity],
    );
    const [minY, maxY] = vecs.reduce(
      ([min, max], v) => {
        const y = v.computed?.vector[1] ?? 0;
        return [Math.min(min, y), Math.max(max, y)];
      },
      [Infinity, -Infinity],
    );

    return { minX, maxX, minY, maxY };
  });

  return (
    <div class='relative flex size-full items-center justify-center rounded-md border bg-muted/20'>
      <div class='absolute bottom-0 right-0 z-10 m-4 flex items-center justify-between'>
        <WeightSelector
          weights={props.sessionWeights}
          selectedWeights={visualizerWeights()}
          onWeightChange={setVisualizerWeights}
          isVertical
        />
      </div>
      <svg
        class='size-full select-none'
        viewBox={`${viewBox().x} ${viewBox().y} ${viewBox().width} ${viewBox().height}`}
        xmlns='http://www.w3.org/2000/svg'
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <g>
          <path
            d='M 295 295 L 305 305 M 305 295 L 295 305'
            fill='none'
            stroke='1'
            class='pointer-events-none stroke-muted'
          />
          <circle
            cx='300'
            cy='300'
            r='75'
            fill='none'
            stroke='1'
            class='pointer-events-none stroke-muted'
          />
          <circle
            cx='300'
            cy='300'
            r='150'
            fill='none'
            stroke='1'
            class='pointer-events-none stroke-muted'
          />
          <circle
            cx='300'
            cy='300'
            r='250'
            fill='none'
            stroke='1'
            class='pointer-events-none stroke-muted'
          />
          <circle
            cx='300'
            cy='300'
            r='400'
            fill='none'
            stroke='1'
            class='pointer-events-none stroke-muted'
          />
        </g>
        <For each={vectors()}>
          {(fontConfig: FontConfig) => (
            <FontVectorPoint
              fontConfig={fontConfig}
              nearestFontConfig={props.nearestFontConfig}
              bounds={bounds()}
              visualizerWeights={visualizerWeights}
              viewBox={viewBox}
              zoomFactor={zoomFactor}
            />
          )}
        </For>
      </svg>
    </div>
  );
}
