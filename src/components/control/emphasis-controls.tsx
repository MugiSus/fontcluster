import { createMemo, createSignal, For } from 'solid-js';
import { createStore } from 'solid-js/store';
import { ChevronRightIcon, SlidersVerticalIcon } from 'lucide-solid';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Slider,
  SliderFill,
  SliderThumb,
  SliderTrack,
} from '@/components/ui/slider';
import { useI18n } from '@/i18n';
import { appState } from '@/store';
import {
  EMPHASIS_ATTRIBUTES,
  type EmphasisAttribute,
} from '@/constants/session';

/**
 * Modal equalizer for the 37 O'Donovan attribute-emphasis levels (-4..4).
 *
 * The store is the draft value of this form control. Hidden inputs remain next
 * to the trigger (outside the dialog portal), so `parseClusteringConfig` keeps
 * owning the conversion from UI values to the persisted sparse map.
 */
export function EmphasisControls() {
  const { t } = useI18n();
  const savedClustering = appState.session.algorithm.clustering;

  const defaultLevels = Object.fromEntries(
    EMPHASIS_ATTRIBUTES.map((attribute) => [
      attribute,
      savedClustering.enable_attribute_emphasis
        ? (savedClustering.emphasis?.[attribute] ?? 0)
        : 0,
    ]),
  ) as Record<EmphasisAttribute, number>;
  const noneLevels = Object.fromEntries(
    EMPHASIS_ATTRIBUTES.map((attribute) => [attribute, 0]),
  ) as Record<EmphasisAttribute, number>;

  const [levels, setLevels] = createStore({ ...defaultLevels });
  const [isOpen, setIsOpen] = createSignal(false);

  const selectedPreset = createMemo(() => {
    if (EMPHASIS_ATTRIBUTES.every((attribute) => levels[attribute] === 0)) {
      return 'none';
    }
    if (
      EMPHASIS_ATTRIBUTES.every(
        (attribute) => levels[attribute] === defaultLevels[attribute],
      )
    ) {
      return 'default';
    }
    return 'custom';
  });

  return (
    <>
      <For each={EMPHASIS_ATTRIBUTES}>
        {(attribute) => (
          <input
            type='hidden'
            name={`clustering-emphasis-${attribute}`}
            value={levels[attribute]}
          />
        )}
      </For>

      <Dialog open={isOpen()} onOpenChange={setIsOpen}>
        <DialogTrigger
          as={Button<'button'>}
          type='button'
          variant='ghost'
          size='sm'
          class='group justify-start px-2 capitalize text-muted-foreground shadow-none hover:text-foreground'
        >
          <SlidersVerticalIcon />
          <span>{t.controlPanel.emphasis.title()}</span>
          <span class='ml-auto text-xs font-medium uppercase tracking-wider text-foreground'>
            {t.controlPanel.emphasis.presets[selectedPreset()]()}
          </span>
          <ChevronRightIcon class='transition-transform group-hover:translate-x-1' />
        </DialogTrigger>

        <DialogContent class='flex w-full max-w-lg flex-col gap-0 overflow-hidden p-0'>
          <DialogHeader class='flex-row items-start gap-4 space-y-0 border-b px-6 py-4 pr-12 text-left'>
            <div class='shrink-0 rounded-full bg-foreground p-2 text-background'>
              <SlidersVerticalIcon />
            </div>
            <div class='flex-1'>
              <DialogTitle class='font-bold'>
                {t.controlPanel.emphasis.equalizerTitle()}
              </DialogTitle>
              <DialogDescription class='mt-2 text-xs leading-relaxed'>
                {t.controlPanel.emphasis.description()}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div class='flex items-center gap-2 border-b px-6 py-4'>
            <span class='mr-2 text-xs font-bold'>
              {t.controlPanel.emphasis.preset()}
            </span>
            <Button
              type='button'
              size='sm'
              variant={selectedPreset() === 'default' ? 'secondary' : 'outline'}
              class='h-8 rounded-full shadow-none'
              onClick={() => setLevels({ ...defaultLevels })}
            >
              {t.controlPanel.emphasis.presets.default()}
            </Button>
            <Button
              type='button'
              size='sm'
              variant={selectedPreset() === 'none' ? 'secondary' : 'outline'}
              class='h-8 rounded-full shadow-none'
              onClick={() => setLevels({ ...noneLevels })}
            >
              {t.controlPanel.emphasis.presets.none()}
            </Button>
            <span class='ml-auto text-xs text-muted-foreground'>
              {t.controlPanel.emphasis.presets[selectedPreset()]()}
            </span>
          </div>

          <div class='flex items-stretch gap-4 overflow-x-scroll p-6'>
            <div
              aria-hidden='true'
              class='flex shrink-0 flex-col items-end justify-between py-6 text-xxs tabular-nums text-muted-foreground'
            >
              <span>+4</span>
              <span>0</span>
              <span>-4</span>
            </div>

            <For each={EMPHASIS_ATTRIBUTES}>
              {(attribute) => {
                const label = t.controlPanel.emphasis.attributes[attribute];
                return (
                  <div class='flex flex-col items-center'>
                    <span class='mb-2 text-xs font-bold tabular-nums'>
                      {levels[attribute] == 0
                        ? '±'
                        : levels[attribute] > 0
                          ? '+'
                          : ''}
                      {levels[attribute]}
                    </span>
                    <Slider
                      value={[levels[attribute]]}
                      onChange={(value) => setLevels(attribute, value[0] ?? 0)}
                      minValue={-4}
                      maxValue={4}
                      step={1}
                      orientation='vertical'
                      getValueLabel={({ values }) =>
                        `${label()}: ${values[0] ?? 0}`
                      }
                      class='h-48 flex-col'
                    >
                      <SliderTrack>
                        <SliderFill
                          style={
                            levels[attribute] >= 0
                              ? {
                                  top: `calc(${50 - levels[attribute] * 12.5}% - 0.25rem)`,
                                  bottom: 'calc(50% - 0.25rem)',
                                }
                              : {
                                  top: 'calc(50% - 0.25rem)',
                                  bottom: `calc(${50 + levels[attribute] * 12.5}% - 0.25rem)`,
                                }
                          }
                        />
                        <SliderThumb aria-label={label()} />
                      </SliderTrack>
                    </Slider>
                    <span class='mt-4 text-center text-xxs leading-tight text-muted-foreground'>
                      {label()}
                    </span>
                  </div>
                );
              }}
            </For>
          </div>

          <DialogFooter class='flex-row items-center justify-between space-x-0 border-t px-6 py-4 sm:justify-between sm:space-x-0'>
            <span class='text-xs text-muted-foreground'>
              {t.controlPanel.emphasis.range()}
            </span>
            <Button
              type='button'
              size='sm'
              class='rounded-full px-4'
              onClick={() => setIsOpen(false)}
            >
              {t.controlPanel.emphasis.done()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
