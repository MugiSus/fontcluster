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
        <DialogTrigger class='group flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs font-medium capitalize text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'>
          <SlidersVerticalIcon class='size-3.5' />
          <span>{t.controlPanel.emphasis.title()}</span>
          <span class='ml-auto text-xs font-medium uppercase tracking-wider text-muted-foreground'>
            {t.controlPanel.emphasis.presets[selectedPreset()]()}
          </span>
          <ChevronRightIcon class='size-3.5 transition-transform group-hover:translate-x-0.5' />
        </DialogTrigger>

        <DialogContent class='flex max-h-[min(720px,calc(100vh-2rem))] w-[min(72rem,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0'>
          <DialogHeader class='flex-row items-start gap-4 space-y-0 border-b px-6 py-5 pr-14 text-left'>
            <div class='flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background'>
              <SlidersVerticalIcon class='size-5' />
            </div>
            <div class='min-w-0 flex-1'>
              <DialogTitle class='font-bold'>
                {t.controlPanel.emphasis.equalizerTitle()}
              </DialogTitle>
              <DialogDescription class='mt-1 max-w-2xl text-xs leading-relaxed'>
                {t.controlPanel.emphasis.description()}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div class='flex items-center gap-2 border-b px-6 py-3'>
            <span class='mr-2 text-xs font-bold'>
              {t.controlPanel.emphasis.preset()}
            </span>
            <Button
              type='button'
              size='sm'
              variant={selectedPreset() === 'default' ? 'secondary' : 'outline'}
              class='h-7 rounded-full px-4 shadow-none'
              onClick={() => setLevels({ ...defaultLevels })}
            >
              {t.controlPanel.emphasis.presets.default()}
            </Button>
            <Button
              type='button'
              size='sm'
              variant={selectedPreset() === 'none' ? 'secondary' : 'outline'}
              class='h-7 rounded-full px-4 shadow-none'
              onClick={() => setLevels({ ...noneLevels })}
            >
              {t.controlPanel.emphasis.presets.none()}
            </Button>
            <span class='ml-auto text-xs text-muted-foreground'>
              {t.controlPanel.emphasis.presets[selectedPreset()]()}
            </span>
          </div>

          <div class='min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-6 py-5'>
            <div class='relative flex min-w-max gap-3'>
              <div class='w-6 shrink-0 pt-7 text-right text-xxs tabular-nums text-muted-foreground'>
                <div class='relative h-52'>
                  <span class='absolute right-0 top-0 -translate-y-1/2'>
                    +4
                  </span>
                  <span class='absolute right-0 top-1/2 -translate-y-1/2'>
                    0
                  </span>
                  <span class='absolute bottom-0 right-0 translate-y-1/2'>
                    -4
                  </span>
                </div>
              </div>

              <div class='pointer-events-none absolute left-9 right-0 top-7 h-52'>
                <div class='absolute inset-x-0 top-0 border-t border-border/60' />
                <div class='absolute inset-x-0 top-1/2 border-t border-foreground/25' />
                <div class='absolute inset-x-0 bottom-0 border-t border-border/60' />
              </div>

              <For each={EMPHASIS_ATTRIBUTES}>
                {(attribute) => {
                  const label = t.controlPanel.emphasis.attributes[attribute];
                  return (
                    <div class='relative z-10 flex w-10 shrink-0 flex-col items-center'>
                      <span class='mb-2 h-5 text-xs font-bold tabular-nums'>
                        {levels[attribute] > 0 ? '+' : ''}
                        {levels[attribute]}
                      </span>
                      <Slider
                        value={[levels[attribute]]}
                        onChange={(value) =>
                          setLevels(attribute, value[0] ?? 0)
                        }
                        minValue={-4}
                        maxValue={4}
                        step={1}
                        orientation='vertical'
                        getValueLabel={({ values }) =>
                          `${label()}: ${values[0] ?? 0}`
                        }
                        class='h-52 w-10 flex-col justify-center'
                      >
                        <SliderTrack class='h-full w-2 grow-0'>
                          <SliderFill
                            class='h-auto w-full'
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
                          <SliderThumb
                            aria-label={label()}
                            class='left-1/2 -ml-2.5'
                          />
                        </SliderTrack>
                      </Slider>
                      <span class='mt-3 flex w-full items-start justify-center text-center text-xxs leading-tight text-muted-foreground'>
                        {label()}
                      </span>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>

          <DialogFooter class='flex-row items-center justify-between space-x-0 border-t px-6 py-4 sm:justify-between sm:space-x-0'>
            <span class='text-xs text-muted-foreground'>
              {t.controlPanel.emphasis.range()}
            </span>
            <Button
              type='button'
              size='sm'
              class='rounded-full px-5'
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
