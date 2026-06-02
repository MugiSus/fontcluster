import {
  CircleMinusIcon,
  FunnelIcon,
  ImageIcon,
  LassoSelectIcon,
  MaximizeIcon,
  MousePointer2Icon,
  TypeIcon,
  ZoomInIcon,
  ZoomOutIcon,
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
  onToolModeChange: (mode: GraphToolMode) => void;
  onToggleImages: () => void;
  onToggleFontNames: () => void;
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
    <div class='flex items-center gap-1 rounded-lg border bg-background p-1'>
      <Tooltip placement='top'>
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

      <Tooltip placement='top'>
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

      <Tooltip placement='top'>
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

      <div class='h-6 border-l' />

      <Tooltip placement='top'>
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
        <TooltipContent>Search</TooltipContent>
      </Tooltip>

      <div class='h-6 border-l' />

      <Tooltip placement='top'>
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

      <Tooltip placement='top'>
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

      <div class='h-6 border-l' />

      <div class='flex gap-0'>
        <Tooltip placement='top'>
          <TooltipTrigger
            as={Button<'button'>}
            variant='ghost'
            size='icon'
            class='size-7 rounded-md shadow-none'
            aria-label='Zoom In'
            disabled={!props.onZoomIn}
            onClick={() => props.onZoomIn?.()}
          >
            <ZoomInIcon class='size-4' />
          </TooltipTrigger>
          <TooltipContent>Zoom In</TooltipContent>
        </Tooltip>

        <Tooltip placement='top'>
          <TooltipTrigger
            as={Button<'button'>}
            variant='ghost'
            size='icon'
            class='size-7 rounded-md shadow-none'
            aria-label='Reset View'
            disabled={!props.onResetZoom}
            onClick={() => props.onResetZoom?.()}
          >
            <MaximizeIcon class='size-4' />
          </TooltipTrigger>
          <TooltipContent>Reset View</TooltipContent>
        </Tooltip>

        <Tooltip placement='top'>
          <TooltipTrigger
            as={Button<'button'>}
            variant='ghost'
            size='icon'
            class='size-7 rounded-md shadow-none'
            aria-label='Zoom Out'
            disabled={!props.onZoomOut}
            onClick={() => props.onZoomOut?.()}
          >
            <ZoomOutIcon class='size-4' />
          </TooltipTrigger>
          <TooltipContent>Zoom Out</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
