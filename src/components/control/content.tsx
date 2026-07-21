import { createSignal, onCleanup, Show } from 'solid-js';
import { debounce } from '@solid-primitives/scheduled';
import { toast } from 'solid-sonner';
import { Button } from '@/components/ui/button';
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
import { PlusIcon, TypeIcon } from 'lucide-solid';
import { WeightSelector } from '@/components/weight-selector';
import { type FontWeight } from '@/types/font';
import {
  type AlgorithmConfig,
  type AnalysisOptions,
  type RenderingOptions,
  type ClusteringOptions,
  type ProcessStatus,
  type FontSet,
  type ClusteringMethod,
} from '@/types/session';
import { appState } from '@/store';
import { runProcessingJobs } from '@/actions';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { EmphasisControls } from './emphasis-controls';
import { NumberProperty } from './number-property';
import { ModelProperty } from './model-property';
import { ControlPropertySection } from './property-section';
import { TextProperty } from './text-property';

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
 * configuration patches.
 *
 * This component owns only ephemeral form state and the submit cooldown. The
 * persisted algorithm, pipeline invalidation and model installation remain
 * backend responsibilities. Full and analysis submissions wait until the
 * catalog can identify the draft model as installed or downloadable; a
 * clustering-only resume does not consume that draft analysis selection.
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

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    handleRun();
  };

  /**
   * Snapshots the form once and submits only the configuration owned by the
   * requested pipeline stages. `not_downloaded` is accepted because starting
   * the backend job is what authorizes its download; transient `loading` and
   * `unknown` values block runs that would consume the draft model.
   */
  const handleRun = async (options?: { override?: ProcessStatus }) => {
    if (isRunCooldown() || !formRef) return;

    const formdata = new FormData(formRef);
    const clustering = parseClusteringConfig(formdata);
    const modelAvailability = formdata.get('analysis-model-availability');
    const isClusteringOnly =
      options?.override === 'analyzed' &&
      (appState.session.status.process_status === 'analyzed' ||
        appState.session.status.process_status === 'clustered');
    if (
      !isClusteringOnly &&
      modelAvailability !== 'available' &&
      modelAvailability !== 'not_downloaded'
    ) {
      toast.warning(t.controlPanel.modelCatalogRequired());
      return;
    }

    setIsRunCooldown(true);
    clearRunCooldown();

    const rendering = parseRenderingConfig(formdata);
    const analysis: AnalysisOptions = {
      model_id:
        (formdata.get('analysis-model-id') as string) ||
        appState.session.algorithm.analysis.model_id,
    };

    const sessionId =
      options?.override ||
      appState.session.status.process_status !== 'clustered'
        ? appState.session.session_id || undefined
        : undefined;

    // Each stage submits only the inputs it owns. The backend remains the
    // authority that compares them with persisted values and chooses the
    // earliest invalidated pipeline stage.
    const algorithm: Partial<AlgorithmConfig> =
      options?.override === 'analyzed'
        ? { clustering }
        : options?.override === 'rendered'
          ? { analysis, clustering }
          : { rendering, analysis, clustering };

    toast.info(t.jobs.toasts.started({ text: rendering.text }));

    try {
      await runProcessingJobs(algorithm, sessionId, options?.override);
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
      <Show when={appState.session.session_id || true} keyed>
        <div class='flex flex-col gap-1 border-b p-4'>
          <TextField class='relative grid w-full items-center gap-1'>
            <TextFieldLabel
              for='rendering-text'
              class='absolute inset-y-0 left-2 flex items-center gap-1.5 font-medium'
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
            />
          </TextField>
          <TextField class='grid w-full items-center gap-1'>
            <Show when={appState.session.session_id || 'session_id'} keyed>
              <WeightSelector
                isMultiple
                weights={[100, 200, 300, 400, 500, 600, 700, 800, 900]}
                defaultValue={appState.session.algorithm.rendering.weights}
                isCompact
              />
            </Show>
          </TextField>
        </div>
        <div class='flex min-h-0 flex-1 grow flex-col gap-1 overflow-y-scroll px-4 py-3'>
          <ControlPropertySection
            title={t.controlPanel.sections.render()}
            isDisabled={isRunCooldown()}
            onStepRun={() => handleRun({ override: 'empty' })}
            isRunnable={false}
          >
            <TextProperty label={t.controlPanel.fonts()} class='mr-1 gap-0.5'>
              <Select
                name='rendering-font-set'
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
                <SelectTrigger class='h-8 border-0 bg-transparent px-0.5 shadow-none hover:bg-muted/50 focus:ring-0 focus:ring-offset-0'>
                  <SelectValue<FontSet> class='mr-2.5 min-w-0 flex-1 text-right'>
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
              step={1}
              minValue={1}
            />
          </ControlPropertySection>

          <ControlPropertySection
            title={t.controlPanel.sections.analyze()}
            isDisabled={
              isRunCooldown() &&
              appState.session.status.process_status !== 'rendered'
            }
            onStepRun={() => handleRun({ override: 'rendered' })}
          >
            <ModelProperty
              modelId={appState.session.algorithm.analysis.model_id}
              sessionId={appState.session.session_id}
            />
          </ControlPropertySection>

          <ControlPropertySection
            title={t.controlPanel.sections.cluster()}
            isDisabled={
              isRunCooldown() &&
              appState.session.status.process_status !== 'analyzed'
            }
            onStepRun={() => handleRun({ override: 'analyzed' })}
          >
            <TextProperty
              label={t.controlPanel.linkageMethod()}
              class='mr-1 gap-0.5'
            >
              <Select
                name='clustering-method'
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
                <SelectTrigger class='h-8 border-0 bg-transparent px-0.5 shadow-none hover:bg-muted/50 focus:ring-0 focus:ring-offset-0'>
                  <SelectValue<ClusteringMethod> class='mr-2.5 min-w-0 flex-1 text-right'>
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
              step={0.01}
              minValue={0}
            />
            <NumberProperty
              label={t.controlPanel.targetClusters()}
              name='clustering-target-cluster-count'
              defaultValue={
                appState.session.algorithm.clustering.target_cluster_count
              }
              step={1}
              minValue={0}
            />
            <EmphasisControls />
          </ControlPropertySection>
        </div>
      </Show>

      <div class='border-t p-4'>
        <Tooltip>
          <TooltipTrigger
            as={Button<'button'>}
            type='submit'
            disabled={isRunCooldown()}
            variant='default'
            size='sm'
            class='relative flex w-full items-center gap-2 rounded-full text-sm font-bold tabular-nums hover:shadow-lg hover:shadow-primary/25'
          >
            {t.controlPanel.generate()}
            <PlusIcon class='absolute right-3' />
          </TooltipTrigger>
          <TooltipContent>{t.controlPanel.generateNew()}</TooltipContent>
        </Tooltip>
      </div>
    </form>
  );
}
