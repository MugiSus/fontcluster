import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  on,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import { listen } from '@tauri-apps/api/event';
import { DownloadIcon } from 'lucide-solid';

import {
  Select,
  SelectContent,
  SelectHiddenSelect,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/i18n';
import { listModels } from '@/lib/models';
import type { ModelCatalogEntry } from '@/types/model';
import { TextProperty } from './text-property';

type ModelPropertyProps = {
  modelId: string;
  sessionId: string;
};

type ModelOption = Omit<ModelCatalogEntry, 'availability'> & {
  availability: ModelCatalogEntry['availability'] | 'unknown';
};

/**
 * Model catalog adapter and form control for the analysis stage.
 *
 * The selected ID is draft form state. Installation remains owned by the
 * backend job, while a completed installation only triggers a catalog refresh
 * so the download indicator reflects backend-owned availability.
 */
export function ModelProperty(props: ModelPropertyProps) {
  const { t, locale } = useI18n();
  const [catalog, { refetch }] = createResource(listModels);
  const [selectedModelId, setSelectedModelId] = createSignal<string>();

  createEffect(
    on(
      () => [props.sessionId, props.modelId] as const,
      ([, modelId]) => setSelectedModelId(modelId),
    ),
  );

  const options = createMemo<ModelOption[]>(() => {
    const models = catalog()?.models ?? [];
    const selectedId = selectedModelId() ?? props.modelId;
    const missingIds = [props.modelId, selectedId].filter(
      (id, index, ids) =>
        ids.indexOf(id) === index && !models.some((model) => model.id === id),
    );
    return [
      ...models,
      ...missingIds.map(
        (id): ModelOption => ({
          id,
          name: id,
          description: '',
          parameterCount: null,
          downloadSize: 0,
          availability: 'unknown',
        }),
      ),
    ];
  });
  const selectedModel = createMemo<ModelOption>(() => {
    const selectedId = selectedModelId() ?? props.modelId;
    return options().find((model) => model.id === selectedId) ?? options()[0]!;
  });

  createEffect(() => {
    const warning = catalog()?.warning;
    if (warning) console.warn('Failed to refresh model releases:', warning);
  });

  onMount(() => {
    const unlistenPromise = listen('model_download_completed', () => {
      void refetch();
    });
    onCleanup(async () => {
      const unlisten = await unlistenPromise;
      unlisten();
    });
  });

  return (
    <TextProperty label={t.controlPanel.model()} class='mr-1 gap-0.5'>
      <Select<ModelOption>
        name='analysis-model-id'
        multiple={false}
        options={options()}
        optionValue='id'
        optionTextValue='name'
        disallowEmptySelection
        value={selectedModel()}
        onChange={(model) => {
          if (model) setSelectedModelId(model.id);
        }}
        itemComponent={(selectProps) => (
          <SelectItem item={selectProps.item} class='pr-8'>
            <span class='flex w-full min-w-0 items-center gap-2'>
              <span class='min-w-0 flex-1 truncate'>
                {selectProps.item.rawValue.name}
              </span>
              <Show
                when={
                  selectProps.item.rawValue.availability === 'not_downloaded'
                }
              >
                <DownloadIcon
                  class='size-3.5 shrink-0 text-muted-foreground'
                  aria-label={t.controlPanel.modelDownloadRequired()}
                />
                <span class='ml-auto shrink-0 text-xs text-muted-foreground'>
                  {`${(
                    selectProps.item.rawValue.downloadSize / 1_000_000
                  ).toLocaleString(locale(), {
                    maximumFractionDigits: 1,
                  })} MB`}
                  {selectProps.item.rawValue.parameterCount
                    ? ` · ${t.controlPanel.modelParameters({
                        count: (
                          selectProps.item.rawValue.parameterCount / 1_000_000
                        ).toLocaleString(locale(), {
                          maximumFractionDigits: 1,
                        }),
                      })}`
                    : ''}
                </span>
              </Show>
            </span>
          </SelectItem>
        )}
      >
        <SelectHiddenSelect />
        <SelectTrigger class='h-8 border-0 bg-transparent px-0.5 shadow-none hover:bg-muted/50 focus:ring-0 focus:ring-offset-0'>
          <SelectValue<ModelOption> class='mr-2.5 min-w-0 flex-1 text-right'>
            {(state) => (
              <span class='flex min-w-0 items-center justify-end gap-1.5'>
                <span class='truncate'>{state.selectedOption().name}</span>
                <Show
                  when={
                    state.selectedOption().availability === 'not_downloaded'
                  }
                >
                  <DownloadIcon class='size-3.5 shrink-0 text-muted-foreground' />
                </Show>
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent />
      </Select>
    </TextProperty>
  );
}
