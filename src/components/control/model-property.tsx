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
import { CircleAlertIcon, DownloadIcon, LoaderCircleIcon } from 'lucide-solid';

import { Button } from '@/components/ui/button';
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

/**
 * Identifies the persisted analysis model and the session that owns it.
 * A session change resets any unsaved selection in the control.
 */
type ModelPropertyProps = {
  modelId: string;
  sessionId: string;
  isChanged?: boolean;
  onDraftChange?: () => void;
};

/**
 * UI projection of a backend catalog entry.
 *
 * `loading` and `unknown` describe the catalog request, not an installation
 * state reported by the backend. They stay local to this control and are
 * submitted only as a guard value for the surrounding control form.
 */
type ModelOption = Omit<ModelCatalogEntry, 'availability'> & {
  availability: ModelCatalogEntry['availability'] | 'loading' | 'unknown';
};

/**
 * Model catalog adapter and form control for the analysis stage.
 *
 * `props.modelId` is the persisted session value. The locally selected ID is
 * draft form state until the surrounding form starts a job. Selecting a model
 * marked `not_downloaded` deliberately performs no side effect: model
 * validation, download and installation remain owned by the backend job.
 *
 * A completed backend installation invalidates the resource so this control
 * can render the new backend-owned availability. It does not maintain a
 * second installation-state cache in the frontend.
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

  /**
   * Preserves persisted and draft IDs while the remote catalog is loading or
   * unavailable. These fallback rows make the selection visible without
   * pretending that its installation state is known.
   */
  const options = createMemo<ModelOption[]>(() => {
    const models = catalog.error ? [] : (catalog()?.models ?? []);
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
          parameterCount: null,
          downloadSize: 0,
          availability: catalog.loading ? 'loading' : 'unknown',
        }),
      ),
    ];
  });
  /** Resolves the select value from the current draft, then the session value. */
  const selectedModel = createMemo<ModelOption>(() => {
    const selectedId = selectedModelId() ?? props.modelId;
    return options().find((model) => model.id === selectedId) ?? options()[0]!;
  });

  /**
   * Normalizes command failures and backend partial-result warnings for the
   * same inline retry affordance.
   */
  const catalogWarning = createMemo(() => {
    const error = catalog.error;
    if (error) return error instanceof Error ? error.message : String(error);
    return catalog()?.warning ?? null;
  });

  /**
   * Installation completion is an invalidation signal only. The subsequent
   * catalog response remains authoritative for availability and metadata.
   */
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
    <div class='flex flex-col'>
      <TextProperty
        label={t.controlPanel.model()}
        class='mr-1 gap-0.5'
        isChanged={props.isChanged ?? false}
      >
        <Select<ModelOption>
          name='analysis-model-id'
          multiple={false}
          options={options()}
          optionValue='id'
          optionTextValue='name'
          disallowEmptySelection
          value={selectedModel()}
          onChange={(model) => {
            if (model) {
              setSelectedModelId(model.id);
              props.onDraftChange?.();
            }
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
                <Show
                  when={selectProps.item.rawValue.availability === 'loading'}
                >
                  <LoaderCircleIcon
                    class='size-3.5 shrink-0 animate-spin text-muted-foreground'
                    aria-label={t.controlPanel.modelCatalogLoading()}
                  />
                  <span class='ml-auto shrink-0 text-xs text-muted-foreground'>
                    {t.controlPanel.modelCatalogLoading()}
                  </span>
                </Show>
                <Show
                  when={selectProps.item.rawValue.availability === 'unknown'}
                >
                  <CircleAlertIcon
                    class='size-3.5 shrink-0 text-muted-foreground'
                    aria-label={t.controlPanel.modelAvailabilityUnknown()}
                  />
                  <span class='ml-auto shrink-0 text-xs text-muted-foreground'>
                    {t.controlPanel.modelAvailabilityUnknown()}
                  </span>
                </Show>
              </span>
            </SelectItem>
          )}
        >
          <SelectHiddenSelect />
          <input
            type='hidden'
            name='analysis-model-availability'
            value={selectedModel().availability}
          />
          <SelectTrigger class='h-8 border-0 bg-transparent px-0.5 shadow-none hover:bg-muted/50 focus:ring-0 focus:ring-offset-0'>
            <SelectValue<ModelOption>
              class='mr-2.5 min-w-0 flex-1 text-right'
              classList={{ '!text-primary': props.isChanged }}
            >
              {(state) => (
                <span class='flex min-w-0 items-center justify-end gap-1.5'>
                  <span class='truncate'>{state.selectedOption().name}</span>
                  <Show
                    when={
                      state.selectedOption().availability === 'not_downloaded'
                    }
                  >
                    <DownloadIcon
                      class='size-3.5 shrink-0 text-muted-foreground'
                      aria-label={t.controlPanel.modelDownloadRequired()}
                    />
                  </Show>
                  <Show
                    when={state.selectedOption().availability === 'loading'}
                  >
                    <LoaderCircleIcon
                      class='size-3.5 shrink-0 animate-spin text-muted-foreground'
                      aria-label={t.controlPanel.modelCatalogLoading()}
                    />
                  </Show>
                  <Show
                    when={state.selectedOption().availability === 'unknown'}
                  >
                    <CircleAlertIcon
                      class='size-3.5 shrink-0 text-muted-foreground'
                      aria-label={t.controlPanel.modelAvailabilityUnknown()}
                    />
                  </Show>
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent />
        </Select>
      </TextProperty>
      <Show when={catalogWarning()}>
        <div
          class='flex items-center justify-end gap-1.5 px-0.5 text-xs text-muted-foreground'
          title={catalogWarning() ?? undefined}
        >
          <CircleAlertIcon class='size-3.5 shrink-0' />
          <span>{t.controlPanel.modelCatalogWarning()}</span>
          <Button
            type='button'
            variant='link'
            class='h-auto p-0 text-xs'
            disabled={catalog.loading}
            onClick={() => void refetch()}
          >
            {t.controlPanel.modelCatalogRetry()}
          </Button>
        </div>
      </Show>
    </div>
  );
}
