import { Show, createMemo } from 'solid-js';
import { FontMetadata, type FontWeight } from '../types/font';
import { getClusterTextColor } from '../lib/cluster-colors';

interface FontVectorPointProps {
  fontMetadata: FontMetadata;
  selectedFontMetadata: FontMetadata | null;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  visualizerWeights: () => FontWeight[];
  viewBox: () => { x: number; y: number; width: number; height: number };
  zoomFactor: () => number;
}

export function FontVectorPoint(props: FontVectorPointProps) {
  const fontMetadata = createMemo(() => props.fontMetadata);
  const bounds = createMemo(() => props.bounds);

  const position = createMemo(() => {
    const config = fontMetadata();
    const x = config.computed?.vector[0] ?? 0;
    const y = config.computed?.vector[1] ?? 0;
    const { minX, maxX, minY, maxY } = bounds();
    return {
      x: ((x - minX) / (maxX - minX)) * 600,
      y: ((y - minY) / (maxY - minY)) * 600,
    };
  });

  const isSelected = createMemo(
    () => props.selectedFontMetadata?.font_name === fontMetadata().font_name,
  );
  const isFamilySelected = createMemo(
    () =>
      props.selectedFontMetadata?.family_name === fontMetadata().family_name,
  );

  return (
    <Show
      when={
        props
          .visualizerWeights()
          .includes(fontMetadata().weight as FontWeight) &&
        position().x > props.viewBox().x - 150 &&
        position().x < props.viewBox().x + props.viewBox().width + 150 &&
        position().y > props.viewBox().y - 50 &&
        position().y < props.viewBox().y + props.viewBox().height + 50
      }
    >
      <g
        transform={`translate(${position().x}, ${position().y}) scale(${props.zoomFactor()})`}
        class={getClusterTextColor(fontMetadata().computed?.k ?? -1)}
      >
        <circle
          cx={0}
          cy={0}
          r={
            isSelected() || isFamilySelected()
              ? 6
              : props.selectedFontMetadata?.family_name ===
                  fontMetadata().family_name
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
              ? fontMetadata().font_name
              : fontMetadata().font_name.length > 12
                ? fontMetadata().font_name.substring(0, 12) + '…'
                : fontMetadata().font_name}
          </text>
        </Show>

        <circle
          cx={0}
          cy={0}
          r={48}
          fill='transparent'
          data-font-config={JSON.stringify(fontMetadata())}
          data-font-select-area
        />
      </g>
    </Show>
  );
}
