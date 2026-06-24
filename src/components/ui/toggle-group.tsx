import type { JSX, ValidComponent } from 'solid-js';
import { createContext, Show, splitProps, useContext } from 'solid-js';

import type { PolymorphicProps } from '@kobalte/core/polymorphic';
import * as ToggleGroupPrimitive from '@kobalte/core/toggle-group';
import type { VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import { toggleVariants } from '@/components/ui/toggle';

type ToggleGroupContextValue = VariantProps<typeof toggleVariants> & {
  // When set, each item renders a built-in selection-state dot (see
  // ToggleGroupItem) that fills in while the item is pressed. `dotSide`
  // picks which edge the dot hugs ('top' centers it along the top edge,
  // 'right' centers it along the right edge); defaults to 'top'.
  showDot?: boolean | undefined;
  dotSide?: 'top' | 'right' | undefined;
};

const ToggleGroupContext = createContext<ToggleGroupContextValue>({
  size: 'default',
  variant: 'default',
});

type ToggleGroupRootProps<T extends ValidComponent = 'div'> =
  ToggleGroupPrimitive.ToggleGroupRootProps<T> &
    VariantProps<typeof toggleVariants> & {
      class?: string | undefined;
      children?: JSX.Element;
      showDot?: boolean;
      dotSide?: 'top' | 'right';
    };

const ToggleGroup = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, ToggleGroupRootProps<T>>,
) => {
  const [local, others] = splitProps(props as ToggleGroupRootProps, [
    'class',
    'children',
    'size',
    'variant',
    'showDot',
    'dotSide',
  ]);

  return (
    <ToggleGroupPrimitive.Root
      class={cn('flex items-center justify-center gap-1', local.class)}
      {...others}
    >
      <ToggleGroupContext.Provider
        value={{
          get size() {
            return local.size;
          },
          get variant() {
            return local.variant;
          },
          get showDot() {
            return local.showDot;
          },
          get dotSide() {
            return local.dotSide;
          },
        }}
      >
        {local.children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
};

type ToggleGroupItemProps<T extends ValidComponent = 'button'> =
  ToggleGroupPrimitive.ToggleGroupItemProps<T> &
    VariantProps<typeof toggleVariants> & {
      class?: string | undefined;
      children?: JSX.Element;
    };

const ToggleGroupItem = <T extends ValidComponent = 'button'>(
  props: PolymorphicProps<T, ToggleGroupItemProps<T>>,
) => {
  const [local, others] = splitProps(props as ToggleGroupItemProps, [
    'class',
    'size',
    'variant',
    'children',
  ]);
  const context = useContext(ToggleGroupContext);
  return (
    <ToggleGroupPrimitive.Item
      class={cn(
        toggleVariants({
          size: context.size || local.size,
          variant: context.variant || local.variant,
        }),
        'hover:bg-muted hover:text-muted-foreground data-[pressed]:bg-accent data-[pressed]:text-accent-foreground',
        context.showDot && 'group relative',
        local.class,
      )}
      {...others}
    >
      {local.children}
      <Show when={context.showDot}>
        <div
          class={cn(
            'absolute size-[3px] rounded-full bg-transparent transition-colors group-data-[pressed]:bg-foreground',
            context.dotSide === 'right'
              ? 'right-[3px] top-1/2 -translate-y-1/2'
              : 'top-1',
          )}
        />
      </Show>
    </ToggleGroupPrimitive.Item>
  );
};

export { ToggleGroup, ToggleGroupItem };
