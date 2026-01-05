import { Show, createMemo } from 'solid-js';
import { FontMetadata, type FontWeight } from '../types/font';
import { getClusterTextColor } from '../lib/cluster-colors';

interface FontVectorPointProps {
  fontMetadata: FontMetadata;
  x: number;
  y: number;
  isSelected: boolean;
  isFamilySelected: boolean;
  visualizerWeights: FontWeight[];
  viewBox: { x: number; y: number; width: number; height: number };
  zoomFactor: number;
  isDisabled?: boolean;
}

export function FontVectorPoint(props: FontVectorPointProps) {
  const fontMetadata = createMemo(() => props.fontMetadata);

  return (
    <Show
      when={
        props.visualizerWeights.includes(fontMetadata().weight as FontWeight) &&
        props.x > props.viewBox.x - 50 &&
        props.x < props.viewBox.x + props.viewBox.width + 50 &&
        props.y > props.viewBox.y - 50 &&
        props.y < props.viewBox.y + props.viewBox.height + 50
      }
    >
      <g
        transform={`translate(${props.x}, ${props.y}) scale(${props.zoomFactor})`}
        class={getClusterTextColor(fontMetadata().computed?.k)}
      >
        <rect
          x={-1.5}
          y={-1.5}
          width={3}
          height={3}
          transform={`rotate(45) scale(${props.isSelected ? 3 : props.isFamilySelected ? 2 : 1})`}
          class='pointer-events-none fill-current'
        />

        <Show when={props.isSelected}>
          <line
            x1={-10}
            y1={0}
            x2={10}
            y2={0}
            stroke='currentColor'
            stroke-width={1}
          />
          <line
            x1={0}
            y1={-15}
            x2={0}
            y2={15}
            stroke='currentColor'
            stroke-width={1}
          />
        </Show>

        <Show when={!props.isSelected && props.isFamilySelected}>
          <line
            x1={-8}
            y1={0}
            x2={8}
            y2={0}
            stroke='currentColor'
            stroke-width={1}
          />
          <line
            x1={0}
            y1={-12}
            x2={0}
            y2={12}
            stroke='currentColor'
            stroke-width={1}
          />
        </Show>

        <Show when={props.isSelected || props.isFamilySelected}>
          <circle
            cx={0}
            cy={0}
            r={props.isSelected ? 40 : 20}
            fill='transparent'
            stroke='currentColor'
            stroke-width={1.5}
          />
        </Show>

        <Show
          when={
            !props.isDisabled && (props.zoomFactor < 0.25 || props.isSelected)
          }
        >
          <text
            x={0}
            y={-12}
            opacity={1}
            class={`pointer-events-none select-none fill-foreground text-xs ${
              props.isSelected ? 'font-bold' : ''
            }`}
            text-anchor='middle'
          >
            {props.isSelected || fontMetadata().font_name.length <= 16
              ? fontMetadata().font_name
              : fontMetadata().font_name.substring(0, 16) + '…'}
          </text>
        </Show>

        <Show when={!props.isDisabled}>
          <circle
            cx={0}
            cy={0}
            r={48}
            fill='transparent'
            data-font-config={JSON.stringify(fontMetadata())}
            data-font-select-area
          />
        </Show>
      </g>
    </Show>
  );
}
