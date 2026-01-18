import { Show, createMemo } from 'solid-js';
import { convertFileSrc } from '@tauri-apps/api/core';
import { type FontWeight } from '../types/font';
import { getClusterTextColor } from '../lib/cluster-colors';

interface FontVectorPointProps {
  fontName: string;
  weight: number;
  clusterId: number | undefined;
  safeName: string;
  x: number;
  y: number;
  isSelected: boolean;
  isFamilySelected: boolean;
  sessionDirectory: string;
  visualizerWeights: FontWeight[];
  zoomFactor: number;
  isDisabled?: boolean;
}

export function FontVectorPoint(props: FontVectorPointProps) {
  const imgSrc = createMemo(() => {
    if (!props.sessionDirectory || !props.safeName) return '';
    return convertFileSrc(
      `${props.sessionDirectory}/${props.safeName}/sample.png`,
    );
  });

  return (
    <g
      transform={`translate(${props.x}, ${props.y}) scale(${props.zoomFactor})`}
      class={getClusterTextColor(props.clusterId)}
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
          {props.isSelected || props.fontName.length <= 16
            ? props.fontName
            : props.fontName.substring(0, 16) + '…'}
        </text>
      </Show>

      <image
        href={imgSrc()}
        x={-32}
        y={-16}
        width={64}
        height={32}
        preserveAspectRatio='xMidYMid meet'
        class='pointer-events-none bg-blend-multiply'
      />
    </g>
  );
}
