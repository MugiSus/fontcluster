import { For, Show, createSignal } from 'solid-js';
import {
  CompressedFontVectorMap,
  FontVectorData,
  FontConfig,
} from '../types/font';

// SVG ViewBox configuration
const INITIAL_VIEWBOX = {
  x: -50,
  y: -50,
  width: 700,
  height: 700,
};

interface FontClusterVisualizationProps {
  compressedVectors: CompressedFontVectorMap | undefined;
  nearestFontConfig: FontConfig | null;
  onFontSelect: (fontConfig: FontConfig) => void;
}

export function FontClusterVisualization(props: FontClusterVisualizationProps) {
  // SVG pan and zoom state
  const [viewBox, setViewBox] = createSignal(INITIAL_VIEWBOX);
  const [isDragging, setIsDragging] = createSignal(false);
  const [lastMousePos, setLastMousePos] = createSignal({ x: 0, y: 0 });

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
    const zoomFactor = event.deltaY > 0 ? 1.1 : 1 / 1.1;

    const newWidth = width * zoomFactor;
    const newHeight = height * zoomFactor;

    // Adjust position to zoom around mouse position
    const newX = svgMouseX - (svgMouseX - x) * zoomFactor;
    const newY = svgMouseY - (svgMouseY - y) * zoomFactor;

    setViewBox({ x: newX, y: newY, width: newWidth, height: newHeight });
  };

  return (
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
      {(() => {
        const vectorsMap = props.compressedVectors || {};
        const zoomFactor = viewBox().width / 700;

        // Convert map to array for processing
        const vectors = Object.values(vectorsMap);

        return (
          <Show when={vectors.length > 0}>
            {(() => {
              // Calculate bounds once
              const [minX, maxX] = vectors.reduce(
                ([min, max], v) => [Math.min(min, v.x), Math.max(max, v.x)],
                [Infinity, -Infinity],
              );

              const [minY, maxY] = vectors.reduce(
                ([min, max], v) => [Math.min(min, v.y), Math.max(max, v.y)],
                [Infinity, -Infinity],
              );

              return (
                <For each={vectors}>
                  {(vectorData: FontVectorData) => {
                    const { x, y, k, config } = vectorData;
                    const scaledX = ((x - minX) / (maxX - minX)) * 600;
                    const scaledY = ((y - minY) / (maxY - minY)) * 600;

                    // Define cluster colors
                    const clusterColors = [
                      'text-blue-500',
                      'text-red-500',
                      'text-yellow-500',
                      'text-green-500',
                      'text-purple-500',
                      'text-orange-500',
                      'text-teal-500',
                      'text-indigo-500',
                      'text-cyan-500',
                      'text-fuchsia-500',
                    ];

                    // Handle noise cluster (-1) with gray-400
                    const clusterColor =
                      k === -1
                        ? 'text-gray-400'
                        : clusterColors[k % clusterColors.length];

                    return (
                      <Show
                        when={
                          scaledX > viewBox().x - 150 &&
                          scaledX < viewBox().x + viewBox().width + 150 &&
                          scaledY > viewBox().y - 50 &&
                          scaledY < viewBox().y + viewBox().height + 50
                        }
                      >
                        <g
                          transform={`translate(${scaledX}, ${scaledY}) scale(${zoomFactor})`}
                          class={clusterColor}
                        >
                          <circle
                            cx={0}
                            cy={0}
                            r={
                              props.nearestFontConfig?.font_name ===
                              config.font_name
                                ? 5
                                : 2
                            }
                            class='pointer-events-none fill-current'
                          />
                          {props.nearestFontConfig?.font_name ===
                            config.font_name && (
                            <circle
                              cx={0}
                              cy={0}
                              r='2.5'
                              class='pointer-events-none fill-background'
                            />
                          )}
                          <circle
                            cx={0}
                            cy={0}
                            r='48'
                            fill='transparent'
                            stroke={
                              props.nearestFontConfig?.font_name ===
                              config.font_name
                                ? 'currentColor'
                                : 'transparent'
                            }
                            stroke-width={1.5}
                            class={`transition-colors ease-in-out ${props.nearestFontConfig?.font_name === config.font_name ? 'duration-0' : 'duration-200'}`}
                            data-font-config={JSON.stringify(config)}
                            data-font-select-area
                          />
                          <Show when={zoomFactor < 0.4}>
                            <text
                              x={0}
                              y={-8}
                              opacity={
                                1 -
                                Math.min(
                                  Math.max((zoomFactor - 0.2) / 0.2, 0),
                                  1,
                                )
                              }
                              class={`pointer-events-none select-none fill-foreground text-xs ${
                                props.nearestFontConfig?.font_name ===
                                config.font_name
                                  ? 'font-bold'
                                  : ''
                              }`}
                              text-anchor='middle'
                            >
                              {props.nearestFontConfig?.font_name ===
                              config.font_name
                                ? config.font_name
                                : config.font_name.length > 12
                                  ? config.font_name.substring(0, 12) + '…'
                                  : config.font_name}
                            </text>
                          </Show>
                        </g>
                      </Show>
                    );
                  }}
                </For>
              );
            })()}
          </Show>
        );
      })()}
    </svg>
  );
}
