import { For, createSignal, createEffect, createMemo, Show } from 'solid-js';
import { emit } from '@tauri-apps/api/event';
import { FontMetadata, type FontWeight } from '../types/font';
import { WeightSelector } from './weight-selector';
import { FontVectorPoint } from './font-vector-point';
import { useElementSize } from '../hooks/use-element-size';

// SVG ViewBox configuration
const INITIAL_VIEWBOX = {
  x: -50,
  y: -50,
  width: 700,
  height: 700,
};

const ZOOM_FACTOR = 1.1;

interface FontClusterVisualizationProps {
  fontMetadataMap: Map<string, FontMetadata> | undefined;
  filteredFontMetadataKeys: Set<string>;
  selectedFontMetadata: FontMetadata | null;
  sessionWeights: FontWeight[];
  onFontSelect: (safeName: FontMetadata) => void;
}

export function FontClusterVisualization(props: FontClusterVisualizationProps) {
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
    const sessionWeights = props.sessionWeights;
    if (sessionWeights && sessionWeights.length > 0) {
      setVisualizerWeights(sessionWeights);
    }
  });

  const getSvgCoordinates = (
    clientX: number,
    clientY: number,
    svgElement: SVGElement,
  ) => {
    const rect = svgElement.getBoundingClientRect();

    // Mouse position relative to SVG element
    const mouseX =
      clientX - rect.left - Math.max(rect.width - rect.height, 0) / 2;
    const mouseY =
      clientY - rect.top - Math.max(rect.height - rect.width, 0) / 2;

    const currentViewBox = viewBox();
    const { x, y, width, height } = currentViewBox;

    // Convert mouse position to SVG coordinates
    const svgMouseX = x + (mouseX / Math.min(rect.width, rect.height)) * width;
    const svgMouseY = y + (mouseY / Math.min(rect.width, rect.height)) * height;

    return { x: svgMouseX, y: svgMouseY };
  };
  const bounds = createMemo(() => {
    const vecs = Array.from(props.fontMetadataMap?.values() || []);
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

  const pointsPositions = createMemo(() => {
    const map = props.fontMetadataMap;
    const { minX, maxX, minY, maxY } = bounds();
    if (!map || maxX === minX) return [];

    return Array.from(props.filteredFontMetadataKeys)
      .map((key) => {
        const metadata = map.get(key);
        if (!metadata) return null;
        return {
          metadata,
          x:
            (((metadata.computed?.vector[0] ?? 0) - minX) / (maxX - minX)) *
            600,
          y:
            (((metadata.computed?.vector[1] ?? 0) - minY) / (maxY - minY)) *
            600,
        };
      })
      .filter(
        (p): p is { metadata: FontMetadata; x: number; y: number } => !!p,
      );
  });

  const selectSelectedFont = (event: MouseEvent) => {
    const { x: svgMouseX, y: svgMouseY } = getSvgCoordinates(
      event.clientX,
      event.clientY,
      event.currentTarget as SVGElement,
    );

    let nearestFont: FontMetadata | null = null;
    let nearestDistanceSq = Infinity;
    const hitRadiusSq = 48 * 48; // Matches r=48 in previous circle

    for (const point of pointsPositions()) {
      const dxSq = (svgMouseX - point.x) ** 2;
      if (dxSq > hitRadiusSq) continue;
      const dySq = (svgMouseY - point.y) ** 2;
      const distSq = dxSq + dySq;

      if (distSq < hitRadiusSq && distSq < nearestDistanceSq) {
        nearestDistanceSq = distSq;
        nearestFont = point.metadata;
      }
    }

    if (nearestFont) {
      props.onFontSelect(nearestFont);
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        emit('copy_family_name', {
          toast: false,
          isFontName: event.ctrlKey || event.metaKey,
        });
      }
      const elements = document.querySelectorAll(
        `[data-font-name="${nearestFont.safe_name}"] > img`,
      );
      elements.forEach((element) => {
        element.scrollIntoView({ behavior: 'instant', block: 'center' });
      });
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
    const zoomFactor = event.deltaY > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;

    const newWidth = width * zoomFactor;
    const newHeight = height * zoomFactor;

    // Adjust position to zoom around mouse position
    const newX = svgMouseX - (svgMouseX - x) * zoomFactor;
    const newY = svgMouseY - (svgMouseY - y) * zoomFactor;

    setViewBox({ x: newX, y: newY, width: newWidth, height: newHeight });
  };

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
      {/* <ul class='absolute left-3 top-2 flex flex-col text-xxs text-muted-foreground'>
        <li>{props.selectedFontMetadata?.font_name}</li>
        <li>{props.selectedFontMetadata?.weight}</li>
        <li>{props.selectedFontMetadata?.computed?.vector.join(', ')}</li>
        <li>K: {props.selectedFontMetadata?.computed?.k}</li>
      </ul> */}
      <svg
        ref={svgRef}
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
            stroke-width={zoomFactor() * 1}
            class='pointer-events-none stroke-muted'
          />
          <circle
            cx='300'
            cy='300'
            r='75'
            fill='none'
            stroke-width={zoomFactor() * 1}
            class='pointer-events-none stroke-muted'
          />
          <circle
            cx='300'
            cy='300'
            r='150'
            fill='none'
            stroke-width={zoomFactor() * 1}
            class='pointer-events-none stroke-muted'
          />
          <circle
            cx='300'
            cy='300'
            r='250'
            fill='none'
            stroke-width={zoomFactor() * 1}
            class='pointer-events-none stroke-muted'
          />
          <circle
            cx='300'
            cy='300'
            r='400'
            fill='none'
            stroke-width={zoomFactor() * 1}
            class='pointer-events-none stroke-muted'
          />
        </g>

        <g opacity={0.2}>
          <For
            each={Array.from(
              new Set(props.fontMetadataMap?.keys() || []).difference(
                props.filteredFontMetadataKeys,
              ),
            )}
          >
            {(fontMetadataKey: string) => (
              <Show when={props.fontMetadataMap?.get(fontMetadataKey)}>
                {(metadata) => (
                  <FontVectorPoint
                    fontName={metadata().font_name}
                    weight={metadata().weight}
                    clusterId={metadata().computed?.k}
                    x={
                      (((metadata().computed?.vector[0] ?? 0) - bounds().minX) /
                        (bounds().maxX - bounds().minX)) *
                      600
                    }
                    y={
                      (((metadata().computed?.vector[1] ?? 0) - bounds().minY) /
                        (bounds().maxY - bounds().minY)) *
                      600
                    }
                    isSelected={
                      props.selectedFontMetadata?.font_name ===
                      metadata().font_name
                    }
                    isFamilySelected={
                      props.selectedFontMetadata?.family_name ===
                      metadata().family_name
                    }
                    visualizerWeights={visualizerWeights()}
                    viewBox={viewBox()}
                    zoomFactor={zoomFactor()}
                    isDisabled
                  />
                )}
              </Show>
            )}
          </For>
        </g>

        <For each={Array.from(props.filteredFontMetadataKeys)}>
          {(fontMetadataKey: string) => (
            <Show when={props.fontMetadataMap?.get(fontMetadataKey)}>
              {(metadata) => (
                <FontVectorPoint
                  fontName={metadata().font_name}
                  weight={metadata().weight}
                  clusterId={metadata().computed?.k}
                  x={
                    (((metadata().computed?.vector[0] ?? 0) - bounds().minX) /
                      (bounds().maxX - bounds().minX)) *
                    600
                  }
                  y={
                    (((metadata().computed?.vector[1] ?? 0) - bounds().minY) /
                      (bounds().maxY - bounds().minY)) *
                    600
                  }
                  isSelected={
                    props.selectedFontMetadata?.font_name ===
                    metadata().font_name
                  }
                  isFamilySelected={
                    props.selectedFontMetadata?.family_name ===
                    metadata().family_name
                  }
                  visualizerWeights={visualizerWeights()}
                  viewBox={viewBox()}
                  zoomFactor={zoomFactor()}
                />
              )}
            </Show>
          )}
        </For>
      </svg>
    </div>
  );
}
