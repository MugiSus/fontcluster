import { createEffect, createMemo, createSignal, Show } from 'solid-js';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  SearchIcon,
  XIcon,
} from 'lucide-solid';
import * as Collapsible from '@kobalte/core/collapsible';
import { useI18n } from '@/i18n';
import { appState } from '@/store';
import { setSelectedFontKey } from '@/commands/font-selection';
import { setVisibleGraphClusters } from '@/commands/graph';
import { cn } from '@/lib/utils';
import { type FontWeight } from '@/types/font';
import { useFilteredFontMetadataKeys } from '@/hooks/use-filtered-font-metadata-keys';
import { createEscapeKeyDown } from '@kobalte/core/primitives/create-escape-key-down';
import { WeightSelector } from '@/components/weight-selector';
import { ClusterSelector } from '@/components/cluster-selector';

/** How many of the largest clusters get a visibility toggle, for now. */
const MAX_CLUSTER_TOGGLES = 9;

interface GraphFilterDockProps {
  isOpen: boolean;
  weights: FontWeight[];
  onWeightsChange: (weights: FontWeight[]) => void;
  onOpenChange: (open: boolean) => void;
}

export function GraphFilterDock(props: GraphFilterDockProps) {
  const { t } = useI18n();
  const { onQueryChange } = useFilteredFontMetadataKeys({
    onFontSelect: setSelectedFontKey,
  });

  const [query, setQuery] = createSignal(appState.ui.searchQuery);
  const isFiltered = createMemo(() => appState.ui.searchQuery.length > 0);

  // The largest clusters get a visibility toggle, displayed by size.
  const topClusters = createMemo(() =>
    appState.session.status.clustering_stats.clusters
      .map((stat, k) => ({
        k,
        size: stat.size,
        clusterAngle: stat.cluster_angle,
      }))
      .toSorted((a, b) => b.size - a.size || a.k - b.k)
      .slice(0, MAX_CLUSTER_TOGGLES)
      .map(({ k, clusterAngle }) => ({ k, clusterAngle })),
  );

  let inputElement: HTMLInputElement | undefined;
  let triggerElement: HTMLButtonElement | undefined;

  createEscapeKeyDown({
    isDisabled: () => !props.isOpen,
    onEscapeKeyDown: () => {
      props.onOpenChange(false);
      triggerElement?.focus({ preventScroll: true });
    },
  });

  const updateQuery = (value: string) => {
    setQuery(value);
    onQueryChange(value);
  };

  // Move focus into the field whenever the dock opens.
  createEffect(() => {
    if (props.isOpen)
      queueMicrotask(() => inputElement?.focus({ preventScroll: true }));
  });

  return (
    <Collapsible.Root
      open={props.isOpen}
      onOpenChange={props.onOpenChange}
      forceMount
      onMouseDown={(event: MouseEvent) => event.stopPropagation()}
      class={cn(
        'absolute bottom-0 left-0 right-0 z-20 mx-auto w-max max-w-[calc(100%-6rem)] rounded-t-xl border border-b-0 border-border/50 bg-background/90 shadow backdrop-blur-md transition-transform duration-200 ease-out motion-reduce:transition-none',
        !props.isOpen && 'translate-y-full',
      )}
    >
      <Collapsible.Trigger
        ref={triggerElement}
        aria-label={
          props.isOpen ? t.graph.filterDock.close() : t.graph.filterDock.open()
        }
        class='absolute -top-5 left-1/2 flex h-5 w-12 -translate-x-1/2 cursor-pointer items-center justify-center rounded-t-md border border-b-0 border-border/50 bg-background text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      >
        <Show when={props.isOpen} fallback={<ChevronUpIcon class='size-4' />}>
          <ChevronDownIcon class='size-4' />
        </Show>
      </Collapsible.Trigger>
      <Collapsible.Content
        inert={!props.isOpen}
        class='max-h-[60dvh] overflow-y-auto overscroll-contain'
      >
        <div class='flex flex-wrap items-center justify-center gap-1 p-2'>
          <div class='relative flex min-w-0 max-w-full items-center'>
            <Show
              when={isFiltered()}
              fallback={
                <SearchIcon class='pointer-events-none absolute left-2 size-4 text-muted-foreground' />
              }
            >
              <button
                type='button'
                aria-label={t.graph.filterDock.clear()}
                onClick={() => {
                  updateQuery('');
                  inputElement?.focus({ preventScroll: true });
                }}
                class='absolute left-0.5 flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
              >
                <XIcon class='size-4' />
              </button>
            </Show>
            <input
              ref={inputElement}
              type='text'
              placeholder={t.graph.filterDock.searchPlaceholder()}
              aria-label={t.graph.filterDock.searchPlaceholder()}
              class='h-8 w-64 max-w-full bg-transparent pl-9 pr-3 text-base font-medium outline-none placeholder:text-xs placeholder:font-normal placeholder:text-muted-foreground sm:text-sm'
              value={query()}
              onInput={(event) => updateQuery(event.currentTarget.value)}
              spellcheck={false}
            />
          </div>

          <Show
            when={props.weights.length > 1 && props.weights.join(',')}
            keyed
          >
            <div class='mx-0.5 h-5 w-px bg-border/60' />
            <div class='max-w-full overflow-x-auto overscroll-x-contain'>
              <WeightSelector
                isBare
                isCompact
                weights={props.weights}
                defaultValue={[]}
                onChange={(weights) =>
                  props.onWeightsChange(
                    weights.length > 0 ? weights : props.weights,
                  )
                }
              />
            </div>
          </Show>

          <Show
            when={
              topClusters().length > 0 &&
              topClusters()
                .map((clustering) => clustering.k)
                .join(',')
            }
            keyed
          >
            <div class='mx-0.5 h-5 w-px bg-border/60' />
            <div class='max-w-full overflow-x-auto overscroll-x-contain'>
              <ClusterSelector
                clusters={topClusters()}
                onChange={setVisibleGraphClusters}
              />
            </div>
          </Show>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
