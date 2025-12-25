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

  const isSelected = createMemo(
    () => props.nearestFontConfig?.font_name === fontConfig().font_name,
  );
  const isFamilySelected = createMemo(
    () => props.nearestFontConfig?.family_name === fontConfig().family_name,
  );

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
            isSelected() || isFamilySelected()
              ? 6
              : props.nearestFontConfig?.family_name ===
                  fontConfig().family_name
                ? 4
                : 1.5
          }
          class='pointer-events-none fill-current'
        />

        <Show when={isSelected() || isFamilySelected()}>
          <circle
            cx={0}
            cy={0}
            r={isSelected() ? 40 : 20}
            fill='transparent'
            stroke='currentColor'
            stroke-width={1.5}
          />
        </Show>

        <Show when={props.zoomFactor() < 0.25 || isSelected()}>
          <text
            x={0}
            y={-12}
            opacity={1}
            class={`pointer-events-none select-none fill-foreground text-xs ${
              isSelected() ? 'font-bold' : ''
            }`}
            text-anchor='middle'
          >
            {isSelected()
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
