import { For, onMount } from 'solid-js';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { getClusterCssColor } from '@/lib/cluster-colors';

interface ClusterSelectorProps {
  /** Clusters to offer (id + circular direction), in display order. */
  clusters: { k: number; clusterAngle: number }[];
  /** Reports the selected cluster id (0 or 1); empty means "show every cluster". */
  onChange: (visibleClusterIds: number[]) => void;
}

export function ClusterSelector(props: ClusterSelectorProps) {
  // Single-select but deselectable: picking a cluster shows only it, clicking it
  // again clears back to "show all" (Kobalte fires null on deselect).
  const handleChange = (value: string | null) => {
    props.onChange(value ? [Number(value)] : []);
  };

  // The parent re-creates this component per cluster set; reset the store back
  // to "show all" on mount so a previous set's selection can't leak in.
  onMount(() => props.onChange([]));

  return (
    <ToggleGroup
      showDot
      onChange={handleChange}
      class='flex-row items-stretch gap-0.5'
    >
      <For each={props.clusters}>
        {(cluster) => (
          <ToggleGroupItem
            value={String(cluster.k)}
            type='button'
            class='flex size-8 items-center justify-center rounded-full px-0 font-bold'
            style={{ color: getClusterCssColor(cluster.clusterAngle) }}
          >
            あ
          </ToggleGroupItem>
        )}
      </For>
    </ToggleGroup>
  );
}
