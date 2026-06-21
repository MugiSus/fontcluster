import {
  CircleMinusIcon,
  FunnelIcon,
  HandIcon,
  ImageIcon,
  LassoSelectIcon,
  MaximizeIcon,
  MinusIcon,
  MousePointer2Icon,
  PlusIcon,
  SparklesIcon,
  TypeIcon,
  ZoomInIcon,
} from 'lucide-solid';
import { appState } from '../../store';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { type GraphToolMode } from './types';
import { createMemo } from 'solid-js';
import { cn } from '../../lib/utils';

interface GraphBottomToolbarProps {
  toolMode: GraphToolMode;
  isSerachVisible: boolean;
  showImages: boolean;
  showFontNames: boolean;
  showGlow: boolean;
  onToolModeChange: (mode: GraphToolMode) => void;
  onToggleImages: () => void;
  onToggleFontNames: () => void;
  onToggleGlow: () => void;
  onToggleSearch: () => void;
  onZoomIn?: (() => void) | undefined;
  onZoomOut?: (() => void) | undefined;
  onResetZoom?: (() => void) | undefined;
}

export function GraphBottomToolbar(props: GraphBottomToolbarProps) {
  const isSearchActive = createMemo(
    () =>
      appState.ui.searchQuery.length > 0 ||
      appState.ui.activeGraphWeights.length !==
        appState.session.config.algorithm.rendering.weights.length,
  );

  return (
    <div class='pointer-events-auto flex flex-col items-center gap-1 rounded-lg border bg-background p-1 shadow-sm'>
      <div class='flex flex-col gap-0'>
        <Tooltip placement='left'>
          <TooltipTrigger
            as={Button<'button'>}
            variant='ghost'
            size='icon'
            class='size-8 rounded-md shadow-none'
            aria-label='Zoom In'
            disabled={!props.onZoomIn}
            onClick={() => props.onZoomIn?.()}
          >
            <PlusIcon class='size-4' />
          </TooltipTrigger>
          <TooltipContent>Zoom In</TooltipContent>
        </Tooltip>

        <Tooltip placement='left'>
          <TooltipTrigger
            as={Button<'button'>}
            variant='ghost'
            size='icon'
            class='size-8 rounded-md shadow-none'
            aria-label='Reset View'
            disabled={!props.onResetZoom}
            onClick={() => props.onResetZoom?.()}
          >
            <MaximizeIcon class='size-4' />
          </TooltipTrigger>
          <TooltipContent>Reset View</TooltipContent>
        </Tooltip>

        <Tooltip placement='left'>
          <TooltipTrigger
            as={Button<'button'>}
            variant='ghost'
            size='icon'
            class='size-8 rounded-md shadow-none'
            aria-label='Zoom Out'
            disabled={!props.onZoomOut}
            onClick={() => props.onZoomOut?.()}
          >
            <MinusIcon class='size-4' />
          </TooltipTrigger>
          <TooltipContent>Zoom Out</TooltipContent>
        </Tooltip>
      </div>

      <div class='w-6 border-t' />

      <Tooltip placement='left'>
        <TooltipTrigger
          as={Button<'button'>}
          variant={props.toolMode === 'select' ? 'default' : 'ghost'}
          size='icon'
          class='size-8 rounded-md shadow-none'
          aria-pressed={props.toolMode === 'select'}
          aria-label='Select'
          onClick={() => props.onToolModeChange('select')}
        >
          <MousePointer2Icon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Select</TooltipContent>
      </Tooltip>

      <Tooltip placement='left'>
        <TooltipTrigger
          as={Button<'button'>}
          variant={props.toolMode === 'lasso-select' ? 'default' : 'ghost'}
          size='icon'
          class='size-8 rounded-md shadow-none'
          aria-pressed={props.toolMode === 'lasso-select'}
          aria-label='Lasso'
          onClick={() => props.onToolModeChange('lasso-select')}
        >
          <LassoSelectIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Lasso</TooltipContent>
      </Tooltip>

      <Tooltip placement='left'>
        <TooltipTrigger
          as={Button<'button'>}
          variant={props.toolMode === 'lasso-exclude' ? 'default' : 'ghost'}
          size='icon'
          class='size-8 rounded-md shadow-none'
          aria-pressed={props.toolMode === 'lasso-exclude'}
          aria-label='Exclude'
          onClick={() => props.onToolModeChange('lasso-exclude')}
        >
          <CircleMinusIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Exclude</TooltipContent>
      </Tooltip>

      <Tooltip placement='left'>
        <TooltipTrigger
          as={Button<'button'>}
          variant={props.toolMode === 'drag' ? 'default' : 'ghost'}
          size='icon'
          class='size-8 rounded-md shadow-none'
          aria-pressed={props.toolMode === 'drag'}
          aria-label='Drag'
          onClick={() => props.onToolModeChange('drag')}
        >
          <HandIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Drag</TooltipContent>
      </Tooltip>

      <Tooltip placement='left'>
        <TooltipTrigger
          as={Button<'button'>}
          variant={props.toolMode === 'zoom' ? 'default' : 'ghost'}
          size='icon'
          class='size-8 rounded-md shadow-none'
          aria-pressed={props.toolMode === 'zoom'}
          aria-label='Zoom'
          onClick={() => props.onToolModeChange('zoom')}
        >
          <ZoomInIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Zoom</TooltipContent>
      </Tooltip>

      <div class='w-6 border-t' />

      <Tooltip placement='left'>
        <TooltipTrigger
          as={Button<'button'>}
          variant={props.showImages ? 'default' : 'ghost'}
          size='icon'
          class='size-8 rounded-md shadow-none'
          aria-pressed={props.showImages}
          aria-label='Show Images'
          onClick={() => props.onToggleImages()}
        >
          <ImageIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Show Images</TooltipContent>
      </Tooltip>

      <Tooltip placement='left'>
        <TooltipTrigger
          as={Button<'button'>}
          variant={props.showFontNames ? 'default' : 'ghost'}
          size='icon'
          class='size-8 rounded-md shadow-none'
          aria-pressed={props.showFontNames}
          aria-label='Show Font Names'
          onClick={() => props.onToggleFontNames()}
        >
          <TypeIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Show Font Names</TooltipContent>
      </Tooltip>

      <Tooltip placement='left'>
        <TooltipTrigger
          as={Button<'button'>}
          variant={props.showGlow ? 'default' : 'ghost'}
          size='icon'
          class='size-8 rounded-md shadow-none'
          aria-pressed={props.showGlow}
          aria-label='Show Glow'
          onClick={() => props.onToggleGlow()}
        >
          <SparklesIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Show Glow</TooltipContent>
      </Tooltip>

      <div class='w-6 border-t' />

      <Tooltip placement='left'>
        <TooltipTrigger
          as={Button<'button'>}
          variant={isSearchActive() ? 'default' : 'ghost'}
          size='icon'
          class={cn(
            'size-8 rounded-md shadow-none',
            !isSearchActive() &&
              props.isSerachVisible &&
              'bg-accent text-accent-foreground',
          )}
          aria-pressed={props.isSerachVisible}
          aria-label='Filter'
          onClick={() => props.onToggleSearch()}
        >
          <FunnelIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Filter</TooltipContent>
      </Tooltip>
    </div>
  );
}
