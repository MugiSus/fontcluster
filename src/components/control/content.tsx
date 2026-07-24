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
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from '@/components/ui/text-field';
import { TypeIcon } from 'lucide-solid';
import { WeightSelector } from '@/components/weight-selector';
import { type FontWeight } from '@/types/font';
import {
  type AlgorithmConfig,
  type AnalysisOptions,
  type RenderingOptions,
  type ClusteringOptions,
  type FontSet,
  type ClusteringMethod,
} from '@/types/session';
import { appState } from '@/store';
import { runProcessingJobs, type ProcessingRunMode } from '@/actions';
import { useI18n } from '@/i18n';
import {
  EMPHASIS_LEVEL_MAX,
  EMPHASIS_LEVEL_MIN,
  EMPHASIS_LEVEL_NEUTRAL,
} from '@/constants/emphasis';
import {
  DEFAULT_CLUSTERING_CONFIG,
  DEFAULT_RENDERING_CONFIG,
  EMPHASIS_ATTRIBUTES,
} from '@/constants/session';
import { EmphasisControls } from './emphasis-controls';
import { NumberProperty } from './number-property';
import { ModelProperty } from './model-property';
import { ControlPropertySection } from './property-section';
import { TextProperty } from './text-property';
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
 * Attribute emphasis is active when at least one submitted level is non-zero.
 * An all-zero map takes the backend's unchanged no-emphasis path.
 */
function parseClusteringConfig(formdata: FormData): ClusteringOptions {
  // Emphasis levels are integers in -4..4; only non-zero axes are kept, so the
  // stored map stays sparse and a missing key reads as "no emphasis".
  const emphasis: Record<string, number> = {};
  for (const attribute of EMPHASIS_ATTRIBUTES) {
    const value = Number(formdata.get(`clustering-emphasis-${attribute}`));
    const level = Number.isFinite(value)
      ? Math.max(EMPHASIS_LEVEL_MIN, Math.min(EMPHASIS_LEVEL_MAX, value))
      : EMPHASIS_LEVEL_NEUTRAL;
    if (level !== EMPHASIS_LEVEL_NEUTRAL) emphasis[attribute] = level;
  }

  return {
    method: (formdata.get('clustering-method') ??
      DEFAULT_CLUSTERING_CONFIG.method) as ClusteringMethod,
    preprocessing_dimensions:
      Number(formdata.get('clustering-preprocessing-dimensions')) ||
      DEFAULT_CLUSTERING_CONFIG.preprocessing_dimensions,
    distance_threshold:
      Number(formdata.get('clustering-distance-threshold')) ||
      DEFAULT_CLUSTERING_CONFIG.distance_threshold,
    target_cluster_count:
      Number(formdata.get('clustering-target-cluster-count')) ||
      DEFAULT_CLUSTERING_CONFIG.target_cluster_count,
    enable_attribute_emphasis: Object.keys(emphasis).length > 0,
    emphasis,
  };
}

/**
 * Renders the algorithm form and adapts its draft inputs into stage-owned
 * configuration patches. The backend compares the complete draft with the
 * persisted session and selects the earliest invalidated stage.
 *
 * This component owns only ephemeral form state and the submit cooldown. The
 * persisted algorithm, pipeline invalidation and model installation remain
 * backend responsibilities. Runs that need feature extraction wait until the
 * catalog can identify the draft model as installed or downloadable.
 */
export function ControlContent() {
  const { t } = useI18n();
  const fontSetLabel = (fontSet: FontSet) => t.controlPanel.fontSets[fontSet]();

  const [isRunCooldown, setIsRunCooldown] = createSignal(false);
  const clearRunCooldown = debounce(() => {
    setIsRunCooldown(false);
  }, 2000);

  onCleanup(() => {
    clearRunCooldown.clear();
  });

  let formRef: HTMLFormElement | undefined;

  // The form is the owner of unsaved draft values. This revision only tells
  // derived labels to re-read that form; it is not a second config store.
  const [draftRevision, setDraftRevision] = createSignal(0);
  const markDraftChanged = () => setDraftRevision((revision) => revision + 1);
  const sessionKey = () =>
    `${appState.session.session_id}:${appState.session.modified_at}`;
  createEffect(on(sessionKey, markDraftChanged));
  const draftFormData = createMemo(() => {
    draftRevision();
    return sessionKey() && formRef ? new FormData(formRef) : undefined;
  });
  const draftValue = (name: string) => draftFormData()?.get(name)?.toString();
  const isDraftStringChanged = (name: string, savedValue: string) => {
    const value = draftValue(name);
    return value !== undefined && value !== savedValue;
  };
  const isDraftNumberChanged = (name: string, savedValue: number) => {
    const value = draftValue(name);
    return (
      value !== undefined &&
      (!Number.isFinite(Number(value)) || Number(value) !== savedValue)
    );
  };
  const isDraftWeightsChanged = (savedWeights: FontWeight[]) => {
    const value = draftValue('weights');
    if (value === undefined) return false;
    const draftWeights = value.split(',').filter(Boolean).map(Number);
    return (
      draftWeights.length !== savedWeights.length ||
      draftWeights.some((weight, index) => weight !== savedWeights[index])
    );
  };
  const isDraftEmphasisChanged = () => {
    const savedClustering = appState.session.algorithm.clustering;
    return EMPHASIS_ATTRIBUTES.some((attribute) => {
      const value = draftValue(`clustering-emphasis-${attribute}`);
      if (value === undefined) return false;
      const draftLevel = Number(value);
      const savedLevel = savedClustering.enable_attribute_emphasis
        ? (savedClustering.emphasis?.[attribute] ?? EMPHASIS_LEVEL_NEUTRAL)
        : EMPHASIS_LEVEL_NEUTRAL;
      return (
        (Number.isFinite(draftLevel) ? draftLevel : EMPHASIS_LEVEL_NEUTRAL) !==
        savedLevel
      );
    });
  };
  const isRenderingSectionChanged = () =>
    isDraftStringChanged(
      'rendering-text',
      appState.session.algorithm.rendering.text || 'A',
    ) ||
    isDraftWeightsChanged(appState.session.algorithm.rendering.weights) ||
    isDraftStringChanged(
      'rendering-font-set',
      appState.session.algorithm.rendering.font_set,
    ) ||
    isDraftNumberChanged(
      'rendering-font-size',
      appState.session.algorithm.rendering.font_size,
    );
  const isAnalysisSectionChanged = () =>
    isDraftStringChanged(
      'analysis-model-id',
      appState.session.algorithm.analysis.model_id,
    );
  const isClusteringSectionChanged = () =>
    isDraftStringChanged(
      'clustering-method',
      appState.session.algorithm.clustering.method,
    ) ||
    isDraftNumberChanged(
      'clustering-preprocessing-dimensions',
      appState.session.algorithm.clustering.preprocessing_dimensions,
    ) ||
    isDraftNumberChanged(
      'clustering-distance-threshold',
      appState.session.algorithm.clustering.distance_threshold,
    ) ||
    isDraftNumberChanged(
      'clustering-target-cluster-count',
      appState.session.algorithm.clustering.target_cluster_count,
    ) ||
    isDraftEmphasisChanged();
  const hasDraftChanges = () =>
    isRenderingSectionChanged() ||
    isAnalysisSectionChanged() ||
    isClusteringSectionChanged();

  const [renderingResetKey, setRenderingResetKey] = createSignal({});
  const [analysisResetKey, setAnalysisResetKey] = createSignal({});
  const [clusteringResetKey, setClusteringResetKey] = createSignal({});

  const restoreRendering = () => {
    setRenderingResetKey({});
    markDraftChanged();
  };
  const restoreAnalysis = () => {
    setAnalysisResetKey({});
    markDraftChanged();
  };
  const restoreClustering = () => {
    setClusteringResetKey({});
    markDraftChanged();
  };

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    void handleRun(hasDraftChanges() ? 'in_place_changed' : 'fresh');
  };

  /**
   * Snapshots the form once and submits only the configuration owned by the
   * selected session mode. `not_downloaded` is accepted because starting the
   * backend job is what authorizes its download; transient `loading` and
   * `unknown` values block runs that need the model.
   */
  const handleRun = async (requestedMode: ProcessingRunMode) => {
    if (isRunCooldown() || !formRef) return;

    const formdata = new FormData(formRef);
    const rendering = parseRenderingConfig(formdata);
    const analysis: AnalysisOptions = {
      model_id:
        (formdata.get('analysis-model-id') as string) ||
        appState.session.algorithm.analysis.model_id,
    };
    const clustering = parseClusteringConfig(formdata);
    const modelAvailability = formdata.get('analysis-model-availability');
    const currentSessionId = appState.session.session_id || undefined;
    const runMode: ProcessingRunMode =
      requestedMode !== 'fresh' && !currentSessionId ? 'fresh' : requestedMode;
    const savedRendering = appState.session.algorithm.rendering;
    const isRenderingChanged =
      rendering.text !== savedRendering.text ||
      rendering.font_set !== savedRendering.font_set ||
      rendering.font_size !== savedRendering.font_size ||
      rendering.weights.length !== savedRendering.weights.length ||
      rendering.weights.some(
        (weight, index) => weight !== savedRendering.weights[index],
      );
    const shouldLoadModel =
      runMode === 'fresh' ||
      appState.session.status.process_status === 'empty' ||
      appState.session.status.process_status === 'rendered' ||
      isRenderingChanged ||
      analysis.model_id !== appState.session.algorithm.analysis.model_id ||
      ((appState.session.status.process_status === 'analyzed' ||
        appState.session.status.process_status === 'clustered') &&
        clustering.enable_attribute_emphasis &&
        Object.values(clustering.emphasis).some((level) => level !== 0));
    if (
      shouldLoadModel &&
      modelAvailability !== 'available' &&
      modelAvailability !== 'not_downloaded'
    ) {
      toast.warning(t.controlPanel.modelCatalogRequired());
      return;
    }

    setIsRunCooldown(true);
    clearRunCooldown();

    // The backend compares all supplied stages with the persisted config and
    // chooses the earliest invalidated stage for this session mode.
    const algorithm: Partial<AlgorithmConfig> = {
      rendering,
      analysis,
      clustering,
    };

    toast.info(t.jobs.toasts.started({ text: rendering.text }));

    try {
      await runProcessingJobs(algorithm, {
        runMode,
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
      onInput={markDraftChanged}
      onChange={markDraftChanged}
      class='flex h-full min-h-0 flex-1 flex-col'
    >
      <Show when={sessionKey()} keyed>
        <Show when={renderingResetKey()} keyed>
          <div class='flex flex-col gap-1 border-b p-4'>
            <TextField class='relative grid w-full items-center gap-1'>
              <TextFieldLabel
                for='rendering-text'
                class='absolute inset-y-0 left-2 flex items-center gap-1.5 font-medium'
                classList={{
                  '!text-primary': isDraftStringChanged(
                    'rendering-text',
                    appState.session.algorithm.rendering.text || 'A',
                  ),
                }}
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
                class='h-9 text-[15px]'
                classList={{
                  '!text-primary': isDraftStringChanged(
                    'rendering-text',
                    appState.session.algorithm.rendering.text || 'A',
                  ),
                }}
              />
            </TextField>
            <TextField class='grid w-full items-center gap-1'>
              <WeightSelector
                isMultiple
                weights={[100, 200, 300, 400, 500, 600, 700, 800, 900]}
                defaultValue={appState.session.algorithm.rendering.weights}
                isCompact
                isChanged={isDraftWeightsChanged(
                  appState.session.algorithm.rendering.weights,
                )}
                onChange={markDraftChanged}
              />
            </TextField>
          </div>
        </Show>
        <div class='flex min-h-0 flex-1 grow flex-col gap-1 overflow-y-scroll px-4 py-3'>
          <Show when={renderingResetKey()} keyed>
            <ControlPropertySection
              title={t.controlPanel.sections.render()}
              isDisabled={isRunCooldown()}
              isChanged={isRenderingSectionChanged()}
              onRestore={restoreRendering}
            >
              <TextProperty
                label={t.controlPanel.fonts()}
                class='mr-1 gap-0.5'
                isChanged={isDraftStringChanged(
                  'rendering-font-set',
                  appState.session.algorithm.rendering.font_set,
                )}
              >
                <Select
                  name='rendering-font-set'
                  options={FONT_SET_KEYS}
                  optionTextValue={fontSetLabel}
                  disallowEmptySelection
                  defaultValue={appState.session.algorithm.rendering.font_set}
                  onChange={() => markDraftChanged()}
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
                  <SelectTrigger class='h-8 border-0 bg-transparent px-0.5 shadow-none hover:bg-muted/50 focus:ring-0 focus:ring-offset-0'>
                    <SelectValue<FontSet>
                      class='mr-2.5 min-w-0 flex-1 text-right'
                      classList={{
                        '!text-primary': isDraftStringChanged(
                          'rendering-font-set',
                          appState.session.algorithm.rendering.font_set,
                        ),
                      }}
                    >
                      {(state) => fontSetLabel(state.selectedOption())}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </TextProperty>
              <NumberProperty
                label={t.controlPanel.textSize()}
                name='rendering-font-size'
                defaultValue={appState.session.algorithm.rendering.font_size}
                isChanged={isDraftNumberChanged(
                  'rendering-font-size',
                  appState.session.algorithm.rendering.font_size,
                )}
                onChange={() => markDraftChanged()}
                step={1}
                minValue={1}
              />
            </ControlPropertySection>
          </Show>

          <Show when={analysisResetKey()} keyed>
            <ControlPropertySection
              title={t.controlPanel.sections.analyze()}
              isDisabled={isRunCooldown()}
              isChanged={isAnalysisSectionChanged()}
              onRestore={restoreAnalysis}
            >
              <ModelProperty
                modelId={appState.session.algorithm.analysis.model_id}
                sessionId={appState.session.session_id}
                isChanged={isDraftStringChanged(
                  'analysis-model-id',
                  appState.session.algorithm.analysis.model_id,
                )}
                onDraftChange={markDraftChanged}
              />
            </ControlPropertySection>
          </Show>

          <Show when={clusteringResetKey()} keyed>
            <ControlPropertySection
              title={t.controlPanel.sections.cluster()}
              isDisabled={isRunCooldown()}
              isChanged={isClusteringSectionChanged()}
              onRestore={restoreClustering}
            >
              <TextProperty
                label={t.controlPanel.linkageMethod()}
                class='mr-1 gap-0.5'
                isChanged={isDraftStringChanged(
                  'clustering-method',
                  appState.session.algorithm.clustering.method,
                )}
              >
                <Select
                  name='clustering-method'
                  options={
                    Object.keys(CLUSTERING_METHOD_LABELS) as ClusteringMethod[]
                  }
                  optionTextValue={(method) => CLUSTERING_METHOD_LABELS[method]}
                  disallowEmptySelection
                  defaultValue={appState.session.algorithm.clustering.method}
                  onChange={() => markDraftChanged()}
                  itemComponent={(props) => (
                    <SelectItem item={props.item}>
                      {CLUSTERING_METHOD_LABELS[props.item.rawValue]}
                    </SelectItem>
                  )}
                >
                  <SelectHiddenSelect />
                  <SelectTrigger class='h-8 border-0 bg-transparent px-0.5 shadow-none hover:bg-muted/50 focus:ring-0 focus:ring-offset-0'>
                    <SelectValue<ClusteringMethod>
                      class='mr-2.5 min-w-0 flex-1 text-right'
                      classList={{
                        '!text-primary': isDraftStringChanged(
                          'clustering-method',
                          appState.session.algorithm.clustering.method,
                        ),
                      }}
                    >
                      {(state) =>
                        CLUSTERING_METHOD_LABELS[state.selectedOption()]
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </TextProperty>
              <NumberProperty
                label={t.controlPanel.preprocessDimensions()}
                name='clustering-preprocessing-dimensions'
                defaultValue={
                  appState.session.algorithm.clustering.preprocessing_dimensions
                }
                isChanged={isDraftNumberChanged(
                  'clustering-preprocessing-dimensions',
                  appState.session.algorithm.clustering
                    .preprocessing_dimensions,
                )}
                onChange={() => markDraftChanged()}
                step={1}
                minValue={1}
                maxValue={384}
              />
              <NumberProperty
                label={t.controlPanel.groupingThreshold()}
                name='clustering-distance-threshold'
                defaultValue={
                  appState.session.algorithm.clustering.distance_threshold
                }
                isChanged={isDraftNumberChanged(
                  'clustering-distance-threshold',
                  appState.session.algorithm.clustering.distance_threshold,
                )}
                onChange={() => markDraftChanged()}
                step={0.01}
                minValue={0}
              />
              <NumberProperty
                label={t.controlPanel.targetClusters()}
                name='clustering-target-cluster-count'
                defaultValue={
                  appState.session.algorithm.clustering.target_cluster_count
                }
                isChanged={isDraftNumberChanged(
                  'clustering-target-cluster-count',
                  appState.session.algorithm.clustering.target_cluster_count,
                )}
                onChange={() => markDraftChanged()}
                step={1}
                minValue={0}
              />
              <EmphasisControls
                isChanged={isDraftEmphasisChanged()}
                onDraftChange={markDraftChanged}
              />
            </ControlPropertySection>
          </Show>
        </div>
      </Show>

      <div class='relative border-t p-4'>
        <GenerateButton
          isDisabled={isRunCooldown()}
          hasSession={Boolean(appState.session.session_id)}
          hasChanges={hasDraftChanges()}
          onSelect={(mode) => void handleRun(mode)}
        />
      </div>
    </form>
  );
}
