import {
  ChartScatterIcon,
  FilterIcon,
  GitForkIcon,
  HandIcon,
  ImageIcon,
  ListIcon,
  MousePointer2Icon,
  TagIcon,
  TelescopeIcon,
  TypeIcon,
  WaypointsIcon,
  ZoomInIcon,
} from 'lucide-solid';
import { createMemo, Match, Show, Switch } from 'solid-js';
import { appState, type GraphMode } from '@/store';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';
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

interface GraphToolbarProps {
  toolMode: GraphToolMode;
  showImages: boolean;
  showSamples: boolean;
  showFontNames: boolean;
  showGlow: boolean;
  showList: boolean;
  graphMode: GraphMode;
  canCycleGraphMode: boolean;
  isFilterOpen: boolean;
  onToolModeChange: (mode: GraphToolMode) => void;
  onToggleImages: () => void;
  onToggleSamples: () => void;
  onToggleFontNames: () => void;
  onToggleGlow: () => void;
  onToggleList: () => void;
  onCycleGraphMode: () => void;
  onToggleFilter: () => void;
}

const toggleItemClass =
  'size-8 rounded-full px-0 text-muted-foreground hover:bg-accent/80 hover:text-foreground';

export function GraphToolbar(props: GraphToolbarProps) {
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
  const graphModeLabel = () => {
    switch (props.graphMode) {
      case 'horizontal-tree':
        return t.graph.bottomToolbar.horizontalTreeMode();
      case 'scatter-plot':
        return t.graph.bottomToolbar.scatterPlotMode();
      default:
        return t.graph.bottomToolbar.radialTreeMode();
    }
  };

  // ToggleGroup (multiple) owns the display toggles; derive its value from the
  // booleans and translate changes back into the individual toggle handlers.
  const displaySelection = () =>
    [
      props.showImages && 'images',
      props.showSamples && 'samples',
      props.showFontNames && 'fontNames',
      props.showGlow && 'glow',
      props.showList && 'list',
    ].filter(Boolean) as string[];

  const handleDisplayChange = (values: string[]) => {
    const next = new Set(values);
    if (next.has('images') !== props.showImages) props.onToggleImages();
    if (next.has('samples') !== props.showSamples) props.onToggleSamples();
    if (next.has('fontNames') !== props.showFontNames) {
      props.onToggleFontNames();
    }
    if (next.has('glow') !== props.showGlow) props.onToggleGlow();
    if (next.has('list') !== props.showList) props.onToggleList();
  };

  return (
    <div class='pointer-events-auto flex max-h-[calc(100dvh-7rem)] flex-col items-center gap-1 overflow-y-auto overscroll-contain rounded-full border border-border/50 bg-background/50 text-muted-foreground shadow-inner-background backdrop-blur-md [&>*]:shrink-0'>
      <Show when={props.canCycleGraphMode}>
        <Tooltip placement='left'>
          <TooltipTrigger
            as={Button<'button'>}
            variant='ghost'
            size='icon'
            class='size-8 rounded-full text-muted-foreground shadow-none hover:bg-accent/80 hover:text-foreground'
            aria-label={graphModeLabel()}
            onClick={() => props.onCycleGraphMode()}
          >
            <Switch fallback={<WaypointsIcon class='size-4' />}>
              <Match when={props.graphMode === 'scatter-plot'}>
                <ChartScatterIcon class='size-4' />
              </Match>
              <Match when={props.graphMode === 'radial-tree'}>
                <WaypointsIcon class='size-4' />
              </Match>
              <Match when={props.graphMode === 'horizontal-tree'}>
                <GitForkIcon class='size-4 -rotate-90' />
              </Match>
            </Switch>
          </TooltipTrigger>
          <TooltipContent>{graphModeLabel()}</TooltipContent>
        </Tooltip>
      </Show>

      <div class='pointer-events-none w-4 border-t' />

      <ToggleGroup
        multiple
        class='flex-col gap-0'
        orientation='vertical'
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
            aria-label={t.graph.bottomToolbar.showSampleImages()}
          >
            <ImageIcon class='size-4' />
          </TooltipTrigger>
          <TooltipContent>
            {t.graph.bottomToolbar.showSampleImages()}
          </TooltipContent>
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

        <Tooltip placement='left'>
          <TooltipTrigger
            as={ToggleGroupItem<'button'>}
            value='list'
            class={toggleItemClass}
            aria-label={t.graph.bottomToolbar.showList()}
          >
            <ListIcon class='size-4' />
          </TooltipTrigger>
          <TooltipContent>{t.graph.bottomToolbar.showList()}</TooltipContent>
        </Tooltip>

        <Tooltip placement='left'>
          <TooltipTrigger
            as={ToggleGroupItem<'button'>}
            value='samples'
            class={toggleItemClass}
            aria-label={t.graph.bottomToolbar.showSamples()}
          >
            <TypeIcon class='size-4' />
          </TooltipTrigger>
          <TooltipContent>{t.graph.bottomToolbar.showSamples()}</TooltipContent>
        </Tooltip>
      </ToggleGroup>

      <div class='pointer-events-none w-4 border-t' />

      <ToggleGroup
        class='flex-col gap-0'
        orientation='vertical'
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
      <div class='pointer-events-none w-4 border-t' />

      <Tooltip placement='left'>
        <TooltipTrigger
          as={Button<'button'>}
          variant='ghost'
          size='icon'
          class={cn(
            'relative size-8 rounded-full text-muted-foreground shadow-none hover:bg-accent/80 hover:text-foreground',
            props.isFilterOpen && 'bg-accent text-accent-foreground',
            isFilterActive() && 'text-foreground',
          )}
          aria-pressed={props.isFilterOpen}
          aria-label={t.graph.bottomToolbar.filter()}
          onClick={() => props.onToggleFilter()}
        >
          <FilterIcon class='size-4' />
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
