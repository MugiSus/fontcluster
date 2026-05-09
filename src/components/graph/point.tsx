import { Show, createMemo } from 'solid-js';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getClusterTextColor } from '../../lib/cluster-colors';

interface GraphPointProps {
  fontName: string;
  weight: number;
  clusterId: number | undefined;
  safeName: string;
  x: number;
  y: number;
  isSelected: boolean;
  isFamilySelected: boolean;
  sessionDirectory: string;
  zoomFactor: number;
  shouldShowImage: boolean;
  shouldShowFontName: boolean;
  isDisabled?: boolean;
}

export function GraphPoint(props: GraphPointProps) {
  const imgSrc = createMemo(() =>
    props.sessionDirectory && props.safeName
      ? convertFileSrc(
          `${props.sessionDirectory}/samples/${props.safeName}/sample.png`,
        )
      : '',
  );

  return (
    <g
      transform={`translate(${props.x}, ${props.y}) scale(${props.zoomFactor})`}
      class={getClusterTextColor(props.clusterId)}
    >
      <Show when={!props.shouldShowImage && !props.isSelected}>
        <rect
          x={props.isFamilySelected ? -3 : -1.5}
          y={props.isFamilySelected ? -3 : -1.5}
          width={props.isFamilySelected ? 6 : 3}
          height={props.isFamilySelected ? 6 : 3}
          transform='rotate(45)'
          class='pointer-events-none fill-current'
        />
      </Show>

      <Show
        when={
          !props.isSelected && props.isFamilySelected && !props.shouldShowImage
        }
      >
        <line
          x1={-6}
          y1={0}
          x2={6}
          y2={0}
          stroke='currentColor'
          stroke-width={1}
        />
        <line
          x1={0}
          y1={-10}
          x2={0}
          y2={10}
          stroke='currentColor'
          stroke-width={1}
        />
      </Show>

      <Show when={props.isSelected || props.isFamilySelected}>
        <circle
          cx={0}
          cy={0}
          r={props.isSelected ? 40 : 24}
          fill='transparent'
          stroke='currentColor'
          stroke-width={1.5}
          stroke-dasharray='3 3'
          stroke-dashoffset={0}
        >
          <animate
            attributeName='stroke-dashoffset'
            from='0'
            to='-6'
            dur='2000ms'
            repeatCount='indefinite'
          />
        </circle>
      </Show>

      <Show when={props.isSelected || props.shouldShowImage}>
        <mask id={`mask-${props.safeName}`}>
          <image
            href={imgSrc()}
            x={-64}
            y={-13}
            width={128}
            height={26}
            preserveAspectRatio='xMidYMid meet'
            image-rendering='optimizeSpeed'
          />
        </mask>
        <rect
          x={-64}
          y={-13}
          width={128}
          height={26}
          class='pointer-events-none fill-current'
          mask={`url(#mask-${props.safeName})`}
        />
      </Show>

      <Show
        when={
          (!props.isDisabled && props.shouldShowFontName) || props.isSelected
        }
      >
        <text
          x={0}
          y={-18}
          opacity={1}
          class={`pointer-events-none select-none fill-foreground text-xxs ${
            props.isSelected
              ? 'font-semibold'
              : 'fill-muted-foreground font-light'
          }`}
          text-anchor='middle'
        >
          {props.isSelected || props.fontName.length <= 20
            ? props.fontName
            : props.fontName.substring(0, 20) + '…'}
        </text>
      </Show>
    </g>
  );
}
