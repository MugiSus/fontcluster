import type { ValidComponent } from 'solid-js';
import { splitProps } from 'solid-js';

import type { PolymorphicProps } from '@kobalte/core/polymorphic';
import * as SliderPrimitive from '@kobalte/core/slider';

import { cn } from '@/lib/utils';

type SliderRootProps<T extends ValidComponent = 'div'> =
  SliderPrimitive.SliderRootProps<T> & {
    class?: string | undefined;
  };

/** A single-thumb slider (Kobalte `Slider` with the track/fill/thumb baked
 *  in). `value`/`onChange` keep Kobalte's array shape. */
const Slider = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, SliderRootProps<T>>,
) => {
  const [local, others] = splitProps(props as SliderRootProps, ['class']);
  return (
    <SliderPrimitive.Root
      class={cn(
        'relative flex w-full touch-none select-none items-center',
        local.class,
      )}
      {...others}
    >
      <SliderPrimitive.Track class='relative h-1 w-full grow rounded-full bg-border'>
        <SliderPrimitive.Fill class='absolute h-full rounded-full bg-foreground/50' />
        <SliderPrimitive.Thumb class='absolute -top-1 block size-3 rounded-full border border-border bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'>
          <SliderPrimitive.Input />
        </SliderPrimitive.Thumb>
      </SliderPrimitive.Track>
    </SliderPrimitive.Root>
  );
};

export { Slider };
