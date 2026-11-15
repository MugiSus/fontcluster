import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  Show,
} from 'solid-js';
import { debounce } from '@solid-primitives/scheduled';
import { toast } from 'solid-sonner';
import {
  Select,
  SelectContent,
  SelectHiddenSelect,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from '@/components/ui/text-field';
import { CircleAlertIcon, CircleArrowDownIcon, TypeIcon } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { WeightSelector } from '@/components/weight-selector';
import { type FontWeight } from '@/types/font';
import {
  type AlgorithmConfig,
  type RenderingOptions,
  type ClusteringOptions,
  type FontSet,
  type ClusteringMethod,
} from '@/types/session';
import { appState } from '@/store';
import { runProcessingJobs, type ProcessingRunMode } from '@/commands/session';
import { useI18n } from '@/i18n';
import {
  DEFAULT_ALGORITHM_CONFIG,
  DEFAULT_CLUSTERING_CONFIG,
  DEFAULT_RENDERING_CONFIG,
} from '@/constants/session';
// import { EmphasisControls } from './emphasis-controls';
import { NumberProperty } from './number-property';
import { useModelCatalog } from './use-model-catalog';
import { ControlPropertySection } from './property-section';
import { SelectProperty } from './select-property';
import { SwitchProperty } from './switch-property';
import { GenerateButton } from './generate-button';

/**
 * Ordered selectable font sets. `system_fonts` stays first so the divider in
 * the item renderer remains at the boundary between local and remote sets.
 * Labels are resolved from the active locale at render time.
 */
const FONT_SET_KEYS: FontSet[] = [
  'system_fonts',
  'google_fonts_popular100',
  'google_fonts_popular200',
  'google_fonts_popular300',
  'google_fonts_popular500',
  'google_fonts_popular1000',
  'google_fonts_popular1500',
  'google_fonts_all',
];

/** Algorithm proper names shared across locales. */
const CLUSTERING_METHOD_LABELS: Record<ClusteringMethod, string> = {
  single: 'Single',
  complete: 'Complete',
  average: 'Average',
  weighted: 'Weighted',
  ward: 'Ward',
  centroid: 'Centroid',
  median: 'Median',
};

/**
 * Reads the rendering inputs off the submitted form, coercing the stringly
 * typed {@link FormData} into a {@link RenderingOptions} and falling back to
 * the default algorithm config for missing fields.
 */
function parseRenderingConfig(formdata: FormData): RenderingOptions {
  const weights = ((formdata.get('weights') as string) || '')
    .split(',')
    .map(Number)
    .filter(Boolean) as FontWeight[];

  return {
    text:
      (formdata.get('rendering-text') as string) ||
      DEFAULT_RENDERING_CONFIG.text,
    weights: weights.length > 0 ? weights : DEFAULT_RENDERING_CONFIG.weights,
    font_set: (formdata.get('rendering-font-set') ??
      DEFAULT_RENDERING_CONFIG.font_set) as FontSet,
    font_size:
      Number(formdata.get('rendering-font-size')) ||
      DEFAULT_RENDERING_CONFIG.font_size,
  };
}

/**
 * Reads the clustering inputs off the submitted form into a
 * {@link ClusteringOptions}, defaulting each field the same way
 * {@link parseRenderingConfig} does.
 *
 * Attribute emphasis is currently hidden, so its persisted settings pass
 * through unchanged rather than being silently cleared by an unrelated edit.
 */
function parseClusteringConfig(
  formdata: FormData,
  savedConfig: ClusteringOptions,
): ClusteringOptions {
  return {
    method: (formdata.get('clustering-method') ??
      DEFAULT_CLUSTERING_CONFIG.method) as ClusteringMethod,
    enable_preprocess_pca: formdata.has('clustering-enable-preprocess-pca'),
    preprocessing_dimensions:
      Number(formdata.get('clustering-preprocessing-dimensions')) ||
      savedConfig.preprocessing_dimensions,
    distance_threshold:
      Number(formdata.get('clustering-distance-threshold')) ||
      DEFAULT_CLUSTERING_CONFIG.distance_threshold,
    target_cluster_count:
      Number(formdata.get('clustering-target-cluster-count')) ||
      DEFAULT_CLUSTERING_CONFIG.target_cluster_count,
    enable_attribute_emphasis: savedConfig.enable_attribute_emphasis,
    emphasis: savedConfig.emphasis,
  };
}

/**
 * Renders the algorithm form and adapts its draft inputs into stage-owned
 * configuration patches. The backend starts at the explicitly enabled stage,
 * or an earlier stage required by persisted status and supplied configuration.
 *
 * This component owns only ephemeral form state and the submit cooldown. The
 * persisted algorithm, pipeline invalidation and model installation remain
 * backend responsibilities. The catalog supplies the explicit download link;
 * jobs verify the installation only when they reach a stage needing the model.
 */
export function ControlContent() {
  const { t, locale } = useI18n();
  const {
    catalog,
    refetch,
    warning: catalogWarning,
    download,
    isDownloading,
  } = useModelCatalog();
  const fontSetLabel = (fontSet: FontSet) => t.controlPanel.fontSets[fontSet]();

  const [isRunCooldown, setIsRunCooldown] = createSignal(false);
  // These gates belong to the draft form, not the persisted algorithm.
  // Disabled stages retain their draft controls but submit the saved config.
  const [isRenderingEnabled, setIsRenderingEnabled] = createSignal(false);
  const [isAnalysisEnabled, setIsAnalysisEnabled] = createSignal(false);
  const [isClusteringEnabled, setIsClusteringEnabled] = createSignal(false);
  const [isPreprocessPcaEnabled, setIsPreprocessPcaEnabled] = createSignal(
    appState.session.algorithm.clustering.enable_preprocess_pca,
  );
  const clearRunCooldown = debounce(() => {
    setIsRunCooldown(false);
  }, 2000);

  onCleanup(() => {
    clearRunCooldown.clear();
  });

  let formRef: HTMLFormElement | undefined;

  const sessionKey = () =>
    `${appState.session.session_id}:${appState.session.modified_at}`;
  createEffect(
    on(sessionKey, () => {
      setIsRenderingEnabled(false);
      setIsAnalysisEnabled(false);
      setIsClusteringEnabled(false);
      setIsPreprocessPcaEnabled(
        appState.session.algorithm.clustering.enable_preprocess_pca,
      );
    }),
  );
  const hasEnabledStages = () =>
    isRenderingEnabled() || isAnalysisEnabled() || isClusteringEnabled();

  const primaryMode = (): Extract<
    ProcessingRunMode,
    'in_place_changed' | 'fresh'
  > =>
    !isRenderingEnabled() && (isAnalysisEnabled() || isClusteringEnabled())
      ? 'in_place_changed'
      : 'fresh';
  // Preview the primary action's affected stages. Disabled downstream stages
  // still run with saved settings when an earlier stage invalidates their output.
  const willRender = () =>
    hasEnabledStages() &&
    (primaryMode() === 'fresh' ||
      !appState.session.session_id ||
      appState.session.status.process_status === 'empty');
  const willAnalyze = () =>
    hasEnabledStages() &&
    (willRender() ||
      isAnalysisEnabled() ||
      appState.session.status.process_status === 'rendered');
  // New sessions and explicit reanalysis use the default model. Clustering
  // existing results retains the model that produced their embeddings.
  const analysisConfig = () =>
    isAnalysisEnabled() || willRender() || !appState.session.session_id
      ? DEFAULT_ALGORITHM_CONFIG.analysis
      : appState.session.algorithm.analysis;
  const modelToDownload = createMemo(() => {
    if (catalog.error) return undefined;
    const model = catalog()?.models.find(
      (entry) => entry.id === DEFAULT_ALGORITHM_CONFIG.analysis.model_id,
    );
    return model?.availability === 'not_downloaded' ? model : undefined;
  });

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (hasEnabledStages()) void handleRun(primaryMode());
  };

  /**
   * Snapshots the form once and submits only the configuration owned by the
   * selected session mode. Model installation is checked by the backend at
   * analysis time, independently of catalog availability in the UI.
   */
  const handleRun = async (requestedMode: ProcessingRunMode) => {
    if (isRunCooldown() || !formRef) return;

    const formdata = new FormData(formRef);
    const rendering = isRenderingEnabled()
      ? parseRenderingConfig(formdata)
      : appState.session.algorithm.rendering;
    const clustering = isClusteringEnabled()
      ? parseClusteringConfig(formdata, appState.session.algorithm.clustering)
      : appState.session.algorithm.clustering;
    const currentSessionId = appState.session.session_id || undefined;
    const runMode: ProcessingRunMode =
      requestedMode !== 'fresh' && !currentSessionId ? 'fresh' : requestedMode;
    const analysis =
      runMode === 'fresh'
        ? DEFAULT_ALGORITHM_CONFIG.analysis
        : analysisConfig();
    setIsRunCooldown(true);
    clearRunCooldown();

    // The backend compares all supplied stages with the persisted config and
    // honors the explicit restart point without skipping incomplete earlier stages.
    const algorithm: Partial<AlgorithmConfig> = {
      rendering,
      analysis,
      clustering,
    };

    toast.info(t.jobs.toasts.started({ text: rendering.text }));

    try {
      await runProcessingJobs(algorithm, {
        runMode,
        ...(runMode !== 'fresh'
          ? {
              overrideStatus: isRenderingEnabled()
                ? ('empty' as const)
                : isAnalysisEnabled()
                  ? ('rendered' as const)
                  : ('analyzed' as const),
            }
          : {}),
        ...(runMode === 'in_place_changed' && currentSessionId
          ? { sessionId: currentSessionId }
          : {}),
        ...(runMode === 'duplicate_changed' && currentSessionId
          ? { sourceSessionId: currentSessionId }
          : {}),
      });
    } catch (error) {
      console.error('Failed to process fonts:', error);
      toast.error(t.jobs.toasts.failed({ error: String(error) }));
    }
  };

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      class='flex h-full min-h-0 flex-1 flex-col'
    >
      <Show when={sessionKey()} keyed>
        <div class='flex min-h-0 flex-1 grow flex-col overflow-y-scroll px-4 py-3'>
          <ControlPropertySection
            title={t.controlPanel.sections.render()}
            isEnabled={isRenderingEnabled()}
            onEnabledChange={setIsRenderingEnabled}
            executionStep={willRender() ? 1 : undefined}
          >
            <Select
              name='rendering-font-set'
              disabled={!isRenderingEnabled()}
              options={FONT_SET_KEYS}
              optionTextValue={fontSetLabel}
              disallowEmptySelection
              defaultValue={appState.session.algorithm.rendering.font_set}
              itemComponent={(props) => (
                <>
                  <SelectItem item={props.item}>
                    {fontSetLabel(props.item.rawValue)}
                  </SelectItem>
                  <Show when={props.item.rawValue === 'system_fonts'}>
                    <div class='my-1 w-full border-t' />
                  </Show>
                </>
              )}
            >
              <SelectHiddenSelect />
              <SelectProperty label={t.controlPanel.fonts()}>
                <SelectValue<FontSet> class='mr-2.5 min-w-0 flex-1 text-right'>
                  {(state) => fontSetLabel(state.selectedOption())}
                </SelectValue>
              </SelectProperty>
              <SelectContent />
            </Select>
            {/* Native group disabling keeps ToggleGroup's selection mounted and
                avoids its cached initial disabled state on re-enable. */}
            <fieldset disabled={!isRenderingEnabled()} class='min-w-0'>
              <WeightSelector
                isMultiple
                weights={[100, 200, 300, 400, 500, 600, 700, 800, 900]}
                defaultValue={appState.session.algorithm.rendering.weights}
                isCompact
              />
            </fieldset>
            <TextField
              disabled={!isRenderingEnabled()}
              class='relative grid w-full items-center gap-1'
            >
              <TextFieldLabel
                for='rendering-text'
                class='absolute inset-y-0 left-0 flex items-center gap-1.5 font-medium data-[disabled]:opacity-50'
              >
                <TypeIcon class='mb-0.5 size-3.5' />
                {t.controlPanel.text()}
              </TextFieldLabel>
              <TextFieldInput
                type='text'
                name='rendering-text'
                id='rendering-text'
                value={appState.session.algorithm.rendering.text || 'A'}
                placeholder='A'
                spellcheck='false'
                class='h-8 pl-24 text-sm'
              />
            </TextField>
            <NumberProperty
              label={t.controlPanel.textSize()}
              name='rendering-font-size'
              disabled={!isRenderingEnabled()}
              defaultValue={appState.session.algorithm.rendering.font_size}
              step={1}
              minValue={1}
            />
          </ControlPropertySection>

          <ControlPropertySection
            title={t.controlPanel.sections.analyze()}
            isEnabled={isAnalysisEnabled()}
            onEnabledChange={setIsAnalysisEnabled}
            executionStep={willAnalyze() ? (willRender() ? 2 : 1) : undefined}
          >
            <Show when={modelToDownload()}>
              {(model) => (
                <Button
                  type='button'
                  variant='link'
                  class='h-auto justify-start px-0 py-1 text-xs'
                  disabled={isDownloading()}
                  onClick={() => {
                    void download(model().id).catch((error) => {
                      toast.error(
                        t.controlPanel.modelDownloadFailed({
                          error: String(error),
                        }),
                      );
                    });
                  }}
                >
                  <CircleArrowDownIcon aria-hidden='true' />
                  {isDownloading()
                    ? t.controlPanel.modelDownloading()
                    : t.controlPanel.downloadModel({
                        size: (model().downloadSize / 1_000_000).toLocaleString(
                          locale(),
                          {
                            maximumFractionDigits: 1,
                          },
                        ),
                      })}
                </Button>
              )}
            </Show>
            <Show when={catalogWarning()}>
              <div
                class='flex items-center gap-1.5 text-xs text-muted-foreground'
                title={catalogWarning() ?? undefined}
              >
                <CircleAlertIcon class='size-3.5 shrink-0' />
                <span>{t.controlPanel.modelCatalogWarning()}</span>
                <Button
                  type='button'
                  variant='link'
                  class='h-auto shrink-0 p-0 text-xs'
                  disabled={catalog.loading}
                  onClick={() => void refetch()}
                >
                  {t.controlPanel.modelCatalogRetry()}
                </Button>
              </div>
            </Show>
          </ControlPropertySection>

          <ControlPropertySection
            title={t.controlPanel.sections.cluster()}
            isEnabled={isClusteringEnabled()}
            onEnabledChange={setIsClusteringEnabled}
            executionStep={
              hasEnabledStages()
                ? willRender()
                  ? 3
                  : willAnalyze()
                    ? 2
                    : 1
                : undefined
            }
            isLast
          >
            <Select
              name='clustering-method'
              disabled={!isClusteringEnabled()}
              options={
                Object.keys(CLUSTERING_METHOD_LABELS) as ClusteringMethod[]
              }
              optionTextValue={(method) => CLUSTERING_METHOD_LABELS[method]}
              disallowEmptySelection
              defaultValue={appState.session.algorithm.clustering.method}
              itemComponent={(props) => (
                <SelectItem item={props.item}>
                  {CLUSTERING_METHOD_LABELS[props.item.rawValue]}
                </SelectItem>
              )}
            >
              <SelectHiddenSelect />
              <SelectProperty label={t.controlPanel.linkageMethod()}>
                <SelectValue<ClusteringMethod> class='mr-2.5 min-w-0 flex-1 text-right'>
                  {(state) => CLUSTERING_METHOD_LABELS[state.selectedOption()]}
                </SelectValue>
              </SelectProperty>
              <SelectContent />
            </Select>
            <SwitchProperty
              label={t.controlPanel.preprocessPca()}
              name='clustering-enable-preprocess-pca'
              disabled={!isClusteringEnabled()}
              checked={isPreprocessPcaEnabled()}
              onChange={setIsPreprocessPcaEnabled}
            />
            <Show when={isPreprocessPcaEnabled()}>
              <NumberProperty
                label={t.controlPanel.preprocessDimensions()}
                name='clustering-preprocessing-dimensions'
                disabled={!isClusteringEnabled()}
                defaultValue={
                  appState.session.algorithm.clustering.preprocessing_dimensions
                }
                step={1}
                minValue={1}
                maxValue={512}
              />
            </Show>
            <NumberProperty
              label={t.controlPanel.groupingThreshold()}
              name='clustering-distance-threshold'
              disabled={!isClusteringEnabled()}
              defaultValue={
                appState.session.algorithm.clustering.distance_threshold
              }
              step={0.01}
              minValue={0}
            />
            <NumberProperty
              label={t.controlPanel.targetClusters()}
              name='clustering-target-cluster-count'
              disabled={!isClusteringEnabled()}
              defaultValue={
                appState.session.algorithm.clustering.target_cluster_count
              }
              step={1}
              minValue={0}
            />
            {/*
                Attribute Equalizer is temporarily hidden.
                <EmphasisControls />
              */}
          </ControlPropertySection>
        </div>
      </Show>

      <div class='relative border-t p-4'>
        <GenerateButton
          isDisabled={isRunCooldown()}
          hasSession={Boolean(appState.session.session_id)}
          hasEnabledStages={hasEnabledStages()}
          primaryMode={primaryMode()}
          onSelect={(mode) => void handleRun(mode)}
        />
      </div>
    </form>
  );
}
