import {
  FunnelIcon,
  HandIcon,
  MaximizeIcon,
  MinusIcon,
  MousePointer2Icon,
  PlusIcon,
  TagIcon,
  TelescopeIcon,
  TypeIcon,
  WaypointsIcon,
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
  showDendrogram: boolean;
  /** Whether the scatter layout has data to show (some font carries a
   *  `clustering.two` coordinate); the dendrogram toggle hides without it. */
  isScatterAvailable: boolean;
  isFilterOpen: boolean;
  onToolModeChange: (mode: GraphToolMode) => void;
  onToggleImages: () => void;
  onToggleFontNames: () => void;
  onToggleGlow: () => void;
  onToggleDendrogram: () => void;
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
  // The filter dot lights up whenever the graph shows less than everything:
  // a search query, a weight subset (any session weight not currently active),
  // or a cluster narrowed down. Checking "some weight is excluded" avoids the
  // false positive the old length compare hit while a session was still loading.
  const isFilterActive = createMemo(() => {
    const activeWeights = new Set(appState.ui.activeGraphWeights);
    const sessionWeights = appState.session.algorithm.rendering.weights;
    return (
      appState.ui.searchQuery.length > 0 ||
      sessionWeights.some((weight) => !activeWeights.has(weight)) ||
      appState.ui.visibleGraphClusters.length > 0
    );
  });

  // ToggleGroup (multiple) owns the display toggles; derive its value from the
  // booleans and translate changes back into the individual toggle handlers.
  const displaySelection = () =>
    [
      props.showImages && 'images',
      props.showFontNames && 'fontNames',
      props.showGlow && 'glow',
    ].filter(Boolean) as string[];

  const handleDisplayChange = (values: string[]) => {
    const next = new Set(values);
    if (next.has('images') !== props.showImages) props.onToggleImages();
    if (next.has('fontNames') !== props.showFontNames) {
      props.onToggleFontNames();
    }
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

        <Tooltip placement='left'>
          <TooltipTrigger
            as={ToggleGroupItem<'button'>}
            value='fontNames'
            class={toggleItemClass}
            aria-label={t.graph.bottomToolbar.showFontNames()}
          >
            <TagIcon class='size-4' />
          </TooltipTrigger>
          <TooltipContent>
            {t.graph.bottomToolbar.showFontNames()}
          </TooltipContent>
        </Tooltip>

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

      {/*
        Rendered only while the scatter layout has data (some font carries a
        `clustering.two` coordinate), rather than passing `disabled`: Kobalte's
        ToggleGroup.Item bakes `disabled` into its selection behavior once at
        mount, so an item mounted disabled (the toolbar mounts before the
        session loads) would stay unclickable even after the data arrives.
      */}
      <Show when={props.isScatterAvailable}>
        <div class='w-6 border-t' />

        <ToggleGroup
          multiple
          class='flex-col'
          value={props.showDendrogram ? ['dendrogram'] : []}
          onChange={(values: string[]) => {
            if (values.includes('dendrogram') !== props.showDendrogram) {
              props.onToggleDendrogram();
            }
          }}
          showDot
          dotSide='right'
        >
          <Tooltip placement='left'>
            <TooltipTrigger
              as={ToggleGroupItem<'button'>}
              value='dendrogram'
              class={toggleItemClass}
              aria-label={t.graph.bottomToolbar.dendrogramMode()}
            >
              <WaypointsIcon class='size-4' />
            </TooltipTrigger>
            <TooltipContent>
              {t.graph.bottomToolbar.dendrogramMode()}
            </TooltipContent>
          </Tooltip>
        </ToggleGroup>
      </Show>

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
