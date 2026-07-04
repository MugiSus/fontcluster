import { createMemo, Show } from 'solid-js';
import { useI18n } from '@/i18n';
import { appState } from '@/store';
import { Slider } from '@/components/ui/slider';

interface DendrogramDockProps {
  /** Merges currently shown; edges of merge ranks past this are hidden. */
  visibleMerges: number;
  onVisibleMergesChange: (count: number) => void;
}

/**
 * Depth control of the dendrogram mode: a slider over the merge rank, so
 * dragging left "ungrows" the clustering merge by merge (linkage order is
 * ascending dissimilarity, so rank is a monotone proxy for the cut height with
 * a uniform slider feel). The readout shows how many clusters remain at the
 * chosen depth.
 */
export function DendrogramDock(props: DendrogramDockProps) {
  const { t } = useI18n();
  const mergeCount = createMemo(() => appState.dendrogram?.merges.length ?? 0);
  const shownMerges = createMemo(() =>
    Math.min(props.visibleMerges, mergeCount()),
  );
  const clusterCount = createMemo(() => {
    const leaves = appState.dendrogram?.ids.length ?? 0;
    return Math.max(leaves - shownMerges(), 0);
  });

  return (
    <Show when={mergeCount() > 0}>
      <div
        class='flex h-10 items-center gap-2.5 rounded-lg border border-border/25 bg-background/50 px-3 text-muted-foreground shadow-inner-background backdrop-blur-md'
        onMouseDown={(event) => event.stopPropagation()}
      >
        <Slider
          class='w-36'
          aria-label={t.graph.dendrogramDock.label()}
          minValue={0}
          maxValue={mergeCount()}
          step={1}
          value={[shownMerges()]}
          onChange={(value) =>
            props.onVisibleMergesChange(value[0] ?? mergeCount())
          }
        />
        <span class='min-w-14 text-right text-xs tabular-nums'>
          {t.graph.dendrogramDock.clusters({ count: clusterCount() })}
        </span>
      </div>
    </Show>
  );
}
