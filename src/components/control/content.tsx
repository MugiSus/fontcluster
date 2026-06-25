import { createSignal, onCleanup, Show } from 'solid-js';
import { debounce } from '@solid-primitives/scheduled';
import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectHiddenSelect,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { TextField, TextFieldInput, TextFieldLabel } from '../ui/text-field';
import { ArrowRightIcon, TypeIcon } from 'lucide-solid';
import { WeightSelector } from '../weight-selector';
import {
  type FontWeight,
  type AlgorithmConfig,
  type RenderingOptions,
  type ClusteringOptions,
  type ProcessStatus,
  type FontSet,
  type ClusteringMethod,
} from '../../types/font';
import { appState } from '../../store';
import { runProcessingJobs } from '../../actions';
import {
  DEFAULT_CLUSTERING_CONFIG,
  DEFAULT_RENDERING_CONFIG,
} from '../../constants/session';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { NumberProperty } from './number-property';
import { ControlPropertySection } from './property-section';
import { TextProperty } from './text-property';

const FONT_SET_LABELS = {
  system_fonts: 'Installed Fonts',
  google_fonts_popular100: 'Google Fonts top 100',
  google_fonts_popular200: 'Google Fonts top 200',
  google_fonts_popular300: 'Google Fonts top 300',
  google_fonts_popular500: 'Google Fonts top 500',
  google_fonts_popular1000: 'Google Fonts top 1000',
  google_fonts_popular1500: 'Google Fonts top 1500',
  google_fonts_all: 'All Google Fonts',
};

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
 */
function parseClusteringConfig(formdata: FormData): ClusteringOptions {
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
  };
}

export function ControlContent() {
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

  const handleRun = async (options?: { override?: ProcessStatus }) => {
    if (isRunCooldown() || !formRef) return;

    setIsRunCooldown(true);
    clearRunCooldown();

    const formdata = new FormData(formRef);
    const rendering = parseRenderingConfig(formdata);
    const clustering = parseClusteringConfig(formdata);

    const sessionId =
      options?.override ||
      appState.session.config.status.process_status !== 'clustered'
        ? appState.session.id || undefined
        : undefined;

    // Re-rendering is expensive, so steps past 'empty' reuse the existing
    // render and only re-cluster; a full run (or a restart from 'empty') redoes
    // both.
    const recomputesRendering =
      options?.override == null || options.override === 'empty';
    const algorithm: Partial<AlgorithmConfig> = recomputesRendering
      ? { rendering, clustering }
      : { clustering };

    await runProcessingJobs(algorithm, sessionId, options?.override);
  };

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      class='flex h-full min-h-0 flex-1 flex-col'
    >
      <Show when={appState.session.config.session_id || true} keyed>
        <div class='flex flex-col gap-1 border-b p-4'>
          <TextField class='relative grid w-full items-center gap-1'>
            <TextFieldLabel
              for='rendering-text'
              class='absolute inset-y-0 left-2 flex items-center gap-1.5 font-medium'
            >
              <TypeIcon class='mb-0.5 size-3.5' />
              Text
            </TextFieldLabel>
            <TextFieldInput
              type='text'
              name='rendering-text'
              id='rendering-text'
              value={appState.session.config.algorithm.rendering.text || 'A'}
              placeholder='A'
              spellcheck='false'
              class='h-9 text-[15px]'
            />
          </TextField>
          <TextField class='grid w-full items-center gap-1'>
            <Show
              when={appState.session.config.session_id || 'session_id'}
              keyed
            >
              <WeightSelector
                weights={[100, 200, 300, 400, 500, 600, 700, 800, 900]}
                defaultValue={
                  appState.session.config.algorithm.rendering.weights
                }
                isCompact
              />
            </Show>
          </TextField>
        </div>
        <div class='flex min-h-0 flex-1 grow flex-col gap-1 space-y-3 overflow-y-scroll p-4'>
          <ControlPropertySection
            title='render'
            disabled={isRunCooldown()}
            onStepRun={() => handleRun({ override: 'empty' })}
            isRunnable={false}
          >
            <TextProperty label='source' class='mr-1 gap-0.5'>
              <Select
                name='rendering-font-set'
                options={Object.keys(FONT_SET_LABELS) as FontSet[]}
                optionTextValue={(fontSet) => FONT_SET_LABELS[fontSet]}
                disallowEmptySelection
                defaultValue={
                  appState.session.config.algorithm.rendering.font_set
                }
                itemComponent={(props) => (
                  <>
                    <SelectItem item={props.item}>
                      {FONT_SET_LABELS[props.item.rawValue]}
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
                    {(state) => FONT_SET_LABELS[state.selectedOption()]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </TextProperty>
            <NumberProperty
              label='font size'
              name='rendering-font-size'
              defaultValue={
                appState.session.config.algorithm.rendering.font_size
              }
              step={1}
              minValue={1}
            />
          </ControlPropertySection>

          <ControlPropertySection
            title='analyze'
            disabled={
              isRunCooldown() &&
              appState.session.config.status.process_status !== 'rendered'
            }
            onStepRun={() => handleRun({ override: 'rendered' })}
          />

          <ControlPropertySection
            title='position'
            disabled={
              isRunCooldown() &&
              appState.session.config.status.process_status !== 'analyzed'
            }
            onStepRun={() => handleRun({ override: 'analyzed' })}
          />

          <ControlPropertySection
            title='cluster'
            disabled={
              isRunCooldown() &&
              appState.session.config.status.process_status !== 'positioned'
            }
            onStepRun={() => handleRun({ override: 'positioned' })}
          >
            <TextProperty label='method' class='mr-1 gap-0.5'>
              <Select
                name='clustering-method'
                options={
                  Object.keys(CLUSTERING_METHOD_LABELS) as ClusteringMethod[]
                }
                optionTextValue={(method) => CLUSTERING_METHOD_LABELS[method]}
                disallowEmptySelection
                defaultValue={
                  appState.session.config.algorithm.clustering.method
                }
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
              label='PCA dimensions'
              name='clustering-preprocessing-dimensions'
              defaultValue={
                appState.session.config.algorithm.clustering
                  .preprocessing_dimensions
              }
              step={1}
              minValue={1}
              maxValue={384}
            />
            <NumberProperty
              label='distance threshold'
              name='clustering-distance-threshold'
              defaultValue={
                appState.session.config.algorithm.clustering.distance_threshold
              }
              step={0.01}
              minValue={0}
            />
            <NumberProperty
              label='target clusters'
              name='clustering-target-cluster-count'
              defaultValue={
                appState.session.config.algorithm.clustering
                  .target_cluster_count
              }
              step={1}
              minValue={0}
            />
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
            Run
            <ArrowRightIcon class='absolute right-3' />
          </TooltipTrigger>
          <TooltipContent>Run processing</TooltipContent>
        </Tooltip>
      </div>
    </form>
  );
}
