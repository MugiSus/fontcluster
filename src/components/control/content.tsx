import { createSignal, onCleanup, Show } from 'solid-js';
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
  type ProcessStatus,
  type FontSet,
  type ClusteringMethod,
} from '../../types/font';
import { appState } from '../../store';
import { runProcessingJobs } from '../../actions';
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

export function ControlContent() {
  const [isRunCooldown, setIsRunCooldown] = createSignal(false);
  let runCooldownTimer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    if (runCooldownTimer) clearTimeout(runCooldownTimer);
  });

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    void handleRun();
  };

  const handleRun = async (targetStatus?: ProcessStatus) => {
    if (isRunCooldown()) return;

    setIsRunCooldown(true);
    if (runCooldownTimer) clearTimeout(runCooldownTimer);
    runCooldownTimer = setTimeout(() => {
      setIsRunCooldown(false);
      runCooldownTimer = undefined;
    }, 2000);

    const form = document.querySelector('form');
    if (!form) return;

    const isCompletedSession =
      appState.session.config.status.process_status === 'clustered';
    const sessionId =
      targetStatus || !isCompletedSession
        ? appState.session.id || undefined
        : undefined;

    const formdata = new FormData(form);
    const text = formdata.get('preview-text') as string;

    const selectedWeightsString = formdata.get('weights') as string;
    const selectedWeightsArray = (
      selectedWeightsString ? selectedWeightsString.split(',').map(Number) : []
    ) as FontWeight[];

    const algorithm: AlgorithmConfig = {
      rendering: {
        font_set: (formdata.get('rendering-font-set') ??
          appState.session.config?.algorithm?.rendering?.font_set ??
          'google_fonts_popular300') as FontSet,
        font_size: Number(formdata.get('rendering-font-size')) || 224,
      },
      clustering: {
        method: (formdata.get('clustering-method') ??
          appState.session.config?.algorithm?.clustering?.method ??
          'average') as ClusteringMethod,
        preprocessing_dimensions: Number(
          formdata.get('clustering-preprocessing-dimensions') || 128,
        ),
        distance_threshold: Number(
          formdata.get('clustering-distance-threshold') || 0.5,
        ),
        target_cluster_count: Number(
          formdata.get('clustering-target-cluster-count') || 0,
        ),
      },
    };

    await runProcessingJobs(
      text || 'A',
      selectedWeightsArray.length > 0 ? selectedWeightsArray : [400],
      algorithm,
      sessionId,
      targetStatus,
    );
  };

  return (
    <form onSubmit={handleSubmit} class='flex h-full min-h-0 flex-1 flex-col'>
      <Show when={appState.session.config.session_id || true} keyed>
        <div class='flex flex-col gap-2 border-b p-4'>
          <TextField class='relative grid w-full items-center gap-1'>
            <TextFieldLabel
              for='preview-text'
              class='absolute inset-y-0 left-2 flex items-center gap-1.5 font-medium'
            >
              <TypeIcon class='mb-0.5 size-3.5' />
              Text
            </TextFieldLabel>
            <TextFieldInput
              type='text'
              name='preview-text'
              id='preview-text'
              value={appState.session.config.preview_text || 'A'}
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
                defaultValue={appState.session.config.weights as FontWeight[]}
                isCompact
              />
            </Show>
          </TextField>
        </div>
        <div class='flex min-h-0 flex-1 grow flex-col gap-1 space-y-3 overflow-y-scroll p-4'>
          <ControlPropertySection
            title='render'
            disabled={isRunCooldown()}
            onStepRun={() => handleRun('empty')}
            isRunnable={false}
          >
            <TextProperty label='source' class='mr-1 gap-0.5'>
              <Select
                name='rendering-font-set'
                options={Object.keys(FONT_SET_LABELS) as FontSet[]}
                optionTextValue={(fontSet) => FONT_SET_LABELS[fontSet]}
                disallowEmptySelection
                defaultValue={
                  appState.session.config?.algorithm?.rendering?.font_set ??
                  'google_fonts_popular300'
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
                appState.session.config?.algorithm?.rendering?.font_size ?? 224
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
            onStepRun={() => handleRun('rendered')}
          />

          <ControlPropertySection
            title='position'
            disabled={
              isRunCooldown() &&
              appState.session.config.status.process_status !== 'analyzed'
            }
            onStepRun={() => handleRun('analyzed')}
          />

          <ControlPropertySection
            title='cluster'
            disabled={
              isRunCooldown() &&
              appState.session.config.status.process_status !== 'positioned'
            }
            onStepRun={() => handleRun('positioned')}
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
                  appState.session.config?.algorithm?.clustering?.method ??
                  'average'
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
                appState.session.config?.algorithm?.clustering
                  ?.preprocessing_dimensions ?? 64
              }
              step={1}
              minValue={1}
              maxValue={384}
            />
            <NumberProperty
              label='distance threshold'
              name='clustering-distance-threshold'
              defaultValue={
                appState.session.config?.algorithm?.clustering
                  ?.distance_threshold ?? 0.4
              }
              step={0.01}
              minValue={0}
            />
            <NumberProperty
              label='target clusters'
              name='clustering-target-cluster-count'
              defaultValue={
                appState.session.config?.algorithm?.clustering
                  ?.target_cluster_count ?? 0
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
