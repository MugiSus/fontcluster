import {
  CircleMinusIcon,
  FunnelIcon,
  HandIcon,
  LassoSelectIcon,
  MaximizeIcon,
  MinusIcon,
  MousePointer2Icon,
  PlusIcon,
  TelescopeIcon,
  TypeIcon,
  ZoomInIcon,
} from 'lucide-solid';
import { createMemo } from 'solid-js';
import { appState } from '../../store';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { type GraphToolMode } from './types';

interface GraphBottomToolbarProps {
  toolMode: GraphToolMode;
  showImages: boolean;
  showFontNames: boolean;
  showGlow: boolean;
  isFilterOpen: boolean;
  onToolModeChange: (mode: GraphToolMode) => void;
  onToggleImages: () => void;
  onToggleFontNames: () => void;
  onToggleGlow: () => void;
  onToggleFilter: () => void;
  onZoomIn?: (() => void) | undefined;
  onZoomOut?: (() => void) | undefined;
  onResetZoom?: (() => void) | undefined;
}

export function GraphBottomToolbar(props: GraphBottomToolbarProps) {
  const isFilterActive = createMemo(
    () =>
      appState.ui.searchQuery.length > 0 ||
      appState.ui.activeGraphWeights.length !==
        appState.session.config.algorithm.rendering.weights.length,
  );

  return (
    <div class='pointer-events-auto flex flex-col items-center gap-1 rounded-lg border border-border/25 bg-background/75 p-1 shadow-sm backdrop-blur-md'>
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
          aria-label='Show Samples'
          onClick={() => props.onToggleImages()}
        >
          <TypeIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Show Samples</TooltipContent>
      </Tooltip>

      {/*
        "Show Font Names" is paused for now. The showFontNames signal and
        onToggleFontNames handler (see GraphContent) plus the props below are
        kept, so the feature can be restored by uncommenting this button.

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
      */}

      <Tooltip placement='left'>
        <TooltipTrigger
          as={Button<'button'>}
          variant={props.showGlow ? 'default' : 'ghost'}
          size='icon'
          class='size-8 rounded-md shadow-none'
          aria-pressed={props.showGlow}
          aria-label='Glow Mode'
          onClick={() => props.onToggleGlow()}
        >
          <TelescopeIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Glow Mode</TooltipContent>
      </Tooltip>

      <div class='w-6 border-t' />

      <Tooltip placement='left'>
        <TooltipTrigger
          as={Button<'button'>}
          variant={isFilterActive() ? 'default' : 'ghost'}
          size='icon'
          class={cn(
            'size-8 rounded-md shadow-none',
            !isFilterActive() &&
              props.isFilterOpen &&
              'bg-accent text-accent-foreground',
          )}
          data-filter-toggle
          aria-pressed={props.isFilterOpen}
          aria-label='Filter'
          onClick={() => props.onToggleFilter()}
        >
          <FunnelIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Filter</TooltipContent>
      </Tooltip>
    </div>
  );
}
