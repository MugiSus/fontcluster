import { Show, createMemo } from 'solid-js';
import { FontVectorData, FontConfig, type FontWeight } from '../types/font';
import { getClusterTextColor } from '../lib/cluster-colors';

interface FontVectorPointProps {
  fontVectorData: FontVectorData;
  nearestFontConfig: FontConfig | null;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  visualizerWeights: () => FontWeight[];
  viewBox: () => { x: number; y: number; width: number; height: number };
  zoomFactor: () => number;
}

export function FontVectorPoint(props: FontVectorPointProps) {
  const vector = createMemo(() => props.fontVectorData);
  const bounds = createMemo(() => props.bounds);

  const position = createMemo(() => {
    const { x, y } = vector();
    const { minX, maxX, minY, maxY } = bounds();
    return {
      x: ((x - minX) / (maxX - minX)) * 600,
      y: ((y - minY) / (maxY - minY)) * 600,
    };
  });

  return (
    <Show
      when={
        props
          .visualizerWeights()
          .includes(vector().config.weight as FontWeight) &&
        position().x > props.viewBox().x - 150 &&
        position().x < props.viewBox().x + props.viewBox().width + 150 &&
        position().y > props.viewBox().y - 50 &&
        position().y < props.viewBox().y + props.viewBox().height + 50
      }
    >
      <g
        transform={`translate(${position().x}, ${position().y}) scale(${props.zoomFactor()})`}
        class={getClusterTextColor(vector().k)}
      >
        <circle
          cx={0}
          cy={0}
          r={
            props.nearestFontConfig?.family_name === vector().config.family_name
              ? 4
              : 1.5
          }
          class='pointer-events-none fill-current'
        />

        <Show
          when={
            props.nearestFontConfig?.font_name === vector().config.font_name ||
            props.nearestFontConfig?.family_name === vector().config.family_name
          }
        >
          <circle
            cx={0}
            cy={0}
            r={
              props.nearestFontConfig?.font_name === vector().config.font_name
                ? 40
                : 20
            }
            fill='transparent'
            stroke='currentColor'
            stroke-width={1.5}
          />
        </Show>

        <Show when={props.zoomFactor() < 0.25}>
          <text
            x={0}
            y={-8}
            opacity={
              1 - Math.min(Math.max((props.zoomFactor() - 0.125) / 0.125, 0), 1)
            }
            class={`pointer-events-none select-none fill-foreground text-xs ${
              props.nearestFontConfig?.font_name === vector().config.font_name
                ? 'font-bold'
                : ''
            }`}
            text-anchor='middle'
          >
            {props.nearestFontConfig?.font_name === vector().config.font_name
              ? vector().config.font_name
              : vector().config.font_name.length > 12
                ? vector().config.font_name.substring(0, 12) + '…'
                : vector().config.font_name}
          </text>
        </Show>

        <circle
          cx={0}
          cy={0}
          r={40}
          fill='transparent'
          data-font-config={JSON.stringify(vector().config)}
          data-font-select-area
        />
      </g>
    </Show>
  );
}
