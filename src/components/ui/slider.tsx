import type { ValidComponent } from 'solid-js';
import { splitProps } from 'solid-js';

import type { PolymorphicProps } from '@kobalte/core/polymorphic';
import * as SliderPrimitive from '@kobalte/core/slider';

import { cn } from '@/lib/utils';

type SliderProps<T extends ValidComponent = 'div'> =
  SliderPrimitive.SliderRootProps<T> & { class?: string | undefined };

const Slider = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, SliderProps<T>>,
) => {
  const [local, others] = splitProps(props as SliderProps, ['class']);
  return (
    <SliderPrimitive.Root
      class={cn(
        'relative flex w-full touch-none select-none items-center',
        local.class,
      )}
      {...others}
    />
  );
};

type SliderTrackProps<T extends ValidComponent = 'div'> =
  SliderPrimitive.SliderTrackProps<T> & { class?: string | undefined };

const SliderTrack = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, SliderTrackProps<T>>,
) => {
  const [local, others] = splitProps(props as SliderTrackProps, ['class']);
  return (
    <SliderPrimitive.Track
      class={cn(
        'relative grow rounded-full bg-secondary data-[orientation=horizontal]:h-2 data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-2',
        local.class,
      )}
      {...others}
    />
  );
};

type SliderFillProps<T extends ValidComponent = 'div'> =
  SliderPrimitive.SliderFillProps<T> & { class?: string | undefined };

const SliderFill = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, SliderFillProps<T>>,
) => {
  const [local, others] = splitProps(props as SliderFillProps, ['class']);
  return (
    <SliderPrimitive.Fill
      class={cn(
        'absolute rounded-full bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full',
        local.class,
      )}
      {...others}
    />
  );
};

type SliderThumbProps<T extends ValidComponent = 'span'> =
  SliderPrimitive.SliderThumbProps<T> & { class?: string | undefined };

const SliderThumb = <T extends ValidComponent = 'span'>(
  props: PolymorphicProps<T, SliderThumbProps<T>>,
) => {
  const [local, others] = splitProps(props as SliderThumbProps, ['class']);
  return (
    <SliderPrimitive.Thumb
      class={cn(
        'block size-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[orientation=horizontal]:top-1/2 data-[orientation=vertical]:left-1/2 data-[orientation=horizontal]:-mt-2.5 data-[orientation=vertical]:-ml-2.5',
        local.class,
      )}
      {...others}
    />
  );
};

export { Slider, SliderFill, SliderThumb, SliderTrack };
