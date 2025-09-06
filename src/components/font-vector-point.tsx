import { Show, createMemo } from 'solid-js';
import { FontConfig, type FontWeight } from '../types/font';
import { getClusterTextColor } from '../lib/cluster-colors';

interface FontVectorPointProps {
  fontConfig: FontConfig;
  nearestFontConfig: FontConfig | null;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  visualizerWeights: () => FontWeight[];
  viewBox: () => { x: number; y: number; width: number; height: number };
  zoomFactor: () => number;
}

export function FontVectorPoint(props: FontVectorPointProps) {
  const fontConfig = createMemo(() => props.fontConfig);
  const nearestFontConfig = createMemo(() => props.nearestFontConfig);
  const bounds = createMemo(() => props.bounds);

  const position = createMemo(() => {
    const config = fontConfig();
    const x = config.computed?.vector[0] ?? 0;
    const y = config.computed?.vector[1] ?? 0;
    const { minX, maxX, minY, maxY } = bounds();
    return {
      x: ((x - minX) / (maxX - minX)) * 600,
      y: ((y - minY) / (maxY - minY)) * 600,
    };
  });

  return (
    <Show
      when={
        props.visualizerWeights().includes(fontConfig().weight as FontWeight) &&
        position().x > props.viewBox().x - 150 &&
        position().x < props.viewBox().x + props.viewBox().width + 150 &&
        position().y > props.viewBox().y - 50 &&
        position().y < props.viewBox().y + props.viewBox().height + 50
      }
    >
      <g
        transform={`translate(${position().x}, ${position().y}) scale(${props.zoomFactor()})`}
        class={getClusterTextColor(fontConfig().computed?.k ?? -1)}
      >
        <circle
          cx={0}
          cy={0}
          r={
            nearestFontConfig()?.safe_name === fontConfig().safe_name ? 6 : 1.2
          }
          class='pointer-events-none fill-current'
        />

        <Show when={nearestFontConfig()?.safe_name === fontConfig().safe_name}>
          <circle
            cx={0}
            cy={0}
            r={40}
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
              nearestFontConfig()?.safe_name === fontConfig().safe_name
                ? 'font-bold'
                : ''
            }`}
            text-anchor='middle'
          >
            {nearestFontConfig()?.safe_name === fontConfig().safe_name
              ? fontConfig().font_name
              : fontConfig().font_name.length > 12
                ? fontConfig().font_name.substring(0, 12) + '…'
                : fontConfig().font_name}
          </text>
        </Show>

        <circle
          cx={0}
          cy={0}
          r={48}
          fill='transparent'
          data-font-config={JSON.stringify(fontConfig())}
          data-font-select-area
        />
      </g>
    </Show>
  );
}
