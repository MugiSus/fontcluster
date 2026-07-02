import {
  FunnelIcon,
  HandIcon,
  MaximizeIcon,
  MinusIcon,
  MousePointer2Icon,
  PlusIcon,
  TelescopeIcon,
  TypeIcon,
  ZoomInIcon,
} from 'lucide-solid';
import { createMemo, Show } from 'solid-js';
import { appState } from '@/store';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  dotVariants,
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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

// Shared look for the ToggleGroup-based items: keep the toolbar's existing
// icon-button footprint and its strong active highlight (primary), rather than
// the default toggle-group accent, so the active tool stays clearly visible.
const toggleItemClass = 'size-8 px-0';

export function GraphBottomToolbar(props: GraphBottomToolbarProps) {
  const { t } = useI18n();
  const isFilterActive = createMemo(
    () =>
      appState.ui.searchQuery.length > 0 ||
      appState.ui.activeGraphWeights.length !==
        appState.session.algorithm.rendering.weights.length,
  );

  // ToggleGroup (multiple) owns the display toggles; derive its value from the
  // booleans and translate changes back into the individual toggle handlers.
  const displaySelection = () =>
    [props.showImages && 'images', props.showGlow && 'glow'].filter(
      Boolean,
    ) as string[];

  const handleDisplayChange = (values: string[]) => {
    const next = new Set(values);
    if (next.has('images') !== props.showImages) props.onToggleImages();
    if (next.has('glow') !== props.showGlow) props.onToggleGlow();
  };

  return (
    <div class='pointer-events-auto flex flex-col items-center gap-1 rounded-lg border border-border/25 bg-background/50 p-1 text-muted-foreground shadow-inner-background backdrop-blur-md'>
      <div class='flex flex-col gap-0'>
        <Tooltip placement='left'>
          <TooltipTrigger
            as={Button<'button'>}
            variant='ghost'
            size='icon'
            class='size-8 rounded-md shadow-none'
            aria-label={t.graph.bottomToolbar.zoomIn()}
            disabled={!props.onZoomIn}
            onClick={() => props.onZoomIn?.()}
          >
            <PlusIcon class='size-4' />
          </TooltipTrigger>
          <TooltipContent>{t.graph.bottomToolbar.zoomIn()}</TooltipContent>
        </Tooltip>

        <Tooltip placement='left'>
          <TooltipTrigger
            as={Button<'button'>}
            variant='ghost'
            size='icon'
            class='size-8 rounded-md shadow-none'
            aria-label={t.graph.bottomToolbar.resetView()}
            disabled={!props.onResetZoom}
            onClick={() => props.onResetZoom?.()}
          >
            <MaximizeIcon class='size-4' />
          </TooltipTrigger>
          <TooltipContent>{t.graph.bottomToolbar.resetView()}</TooltipContent>
        </Tooltip>

        <Tooltip placement='left'>
          <TooltipTrigger
            as={Button<'button'>}
            variant='ghost'
            size='icon'
            class='size-8 rounded-md shadow-none'
            aria-label={t.graph.bottomToolbar.zoomOut()}
            disabled={!props.onZoomOut}
            onClick={() => props.onZoomOut?.()}
          >
            <MinusIcon class='size-4' />
          </TooltipTrigger>
          <TooltipContent>{t.graph.bottomToolbar.zoomOut()}</TooltipContent>
        </Tooltip>
      </div>

      <div class='w-6 border-t' />

      <ToggleGroup
        class='flex-col'
        value={props.toolMode}
        onChange={(value) => {
          if (value) props.onToolModeChange(value as GraphToolMode);
        }}
        showDot
        dotSide='right'
      >
        <Tooltip placement='left'>
          <TooltipTrigger
            as={ToggleGroupItem<'button'>}
            value='select'
            class={toggleItemClass}
            aria-label={t.graph.bottomToolbar.select()}
          >
            <MousePointer2Icon class='size-4' />
          </TooltipTrigger>
          <TooltipContent>{t.graph.bottomToolbar.select()}</TooltipContent>
        </Tooltip>

        {/*
          "Lasso" and "Exclude" are temporarily hidden as their importance has
          faded. The tool modes ('lasso-select' / 'lasso-exclude') still exist,
          so restore these items by uncommenting them.

          <Tooltip placement='left'>
            <TooltipTrigger
              as={ToggleGroupItem<'button'>}
              value='lasso-select'
              class={toggleItemClass}
              aria-label='Lasso'
            >
              <LassoSelectIcon class='size-4' />
            </TooltipTrigger>
            <TooltipContent>Lasso</TooltipContent>
          </Tooltip>

          <Tooltip placement='left'>
            <TooltipTrigger
              as={ToggleGroupItem<'button'>}
              value='lasso-exclude'
              class={toggleItemClass}
              aria-label='Exclude'
            >
              <CircleMinusIcon class='size-4' />
            </TooltipTrigger>
            <TooltipContent>Exclude</TooltipContent>
          </Tooltip>
        */}

        <Tooltip placement='left'>
          <TooltipTrigger
            as={ToggleGroupItem<'button'>}
            value='drag'
            class={toggleItemClass}
            aria-label={t.graph.bottomToolbar.drag()}
          >
            <HandIcon class='size-4' />
          </TooltipTrigger>
          <TooltipContent>{t.graph.bottomToolbar.drag()}</TooltipContent>
        </Tooltip>

        <Tooltip placement='left'>
          <TooltipTrigger
            as={ToggleGroupItem<'button'>}
            value='zoom'
            class={toggleItemClass}
            aria-label={t.graph.bottomToolbar.zoom()}
          >
            <ZoomInIcon class='size-4' />
          </TooltipTrigger>
          <TooltipContent>{t.graph.bottomToolbar.zoom()}</TooltipContent>
        </Tooltip>
      </ToggleGroup>

      <div class='w-6 border-t' />

      <ToggleGroup
        multiple
        class='flex-col'
        value={displaySelection()}
        onChange={handleDisplayChange}
        showDot
        dotSide='right'
      >
        <Tooltip placement='left'>
          <TooltipTrigger
            as={ToggleGroupItem<'button'>}
            value='images'
            class={toggleItemClass}
            aria-label={t.graph.bottomToolbar.showSamples()}
          >
            <TypeIcon class='size-4' />
          </TooltipTrigger>
          <TooltipContent>{t.graph.bottomToolbar.showSamples()}</TooltipContent>
        </Tooltip>

        {/*
          "Show Font Names" is paused for now. The showFontNames signal and
          onToggleFontNames handler (see GraphContent) plus the props below are
          kept, so the feature can be restored by uncommenting this item.

          <Tooltip placement='left'>
            <TooltipTrigger
              as={ToggleGroupItem<'button'>}
              value='font-names'
              class={toggleItemClass}
              aria-label='Show Font Names'
            >
              <TypeIcon class='size-4' />
            </TooltipTrigger>
            <TooltipContent>Show font names</TooltipContent>
          </Tooltip>
        */}

        <Tooltip placement='left'>
          <TooltipTrigger
            as={ToggleGroupItem<'button'>}
            value='glow'
            class={toggleItemClass}
            aria-label={t.graph.bottomToolbar.glowMode()}
          >
            <TelescopeIcon class='size-4' />
          </TooltipTrigger>
          <TooltipContent>{t.graph.bottomToolbar.glowMode()}</TooltipContent>
        </Tooltip>
      </ToggleGroup>

      <div class='w-6 border-t' />

      <Tooltip placement='left'>
        <TooltipTrigger
          as={Button<'button'>}
          variant='ghost'
          size='icon'
          class={cn(
            'relative size-8 rounded-md shadow-none',
            props.isFilterOpen && 'bg-accent text-accent-foreground',
            isFilterActive() && 'text-foreground',
          )}
          data-filter-toggle
          aria-pressed={props.isFilterOpen}
          aria-label={t.graph.bottomToolbar.filter()}
          onClick={() => props.onToggleFilter()}
        >
          <FunnelIcon class='size-4' />
          {/*
            Mark the active filter with a small neutral dot rather than a
            primary-filled button: a lone primary surface here would pull the
            eye away from the canvas, so we keep the accent budget for content.
          */}
          <Show when={isFilterActive()}>
            <span class={cn(dotVariants({ side: 'right' }), 'bg-foreground')} />
          </Show>
        </TooltipTrigger>
        <TooltipContent>{t.graph.bottomToolbar.filter()}</TooltipContent>
      </Tooltip>
    </div>
  );
}
