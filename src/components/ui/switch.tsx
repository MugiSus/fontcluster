import type { ParentProps, ValidComponent, VoidProps } from 'solid-js';
import { splitProps } from 'solid-js';

import * as SwitchPrimitive from '@kobalte/core/switch';
import type { PolymorphicProps } from '@kobalte/core/polymorphic';

import { cn } from '@/lib/utils';

const Switch = SwitchPrimitive.Root;
const SwitchDescription = SwitchPrimitive.Description;
const SwitchErrorMessage = SwitchPrimitive.ErrorMessage;

type SwitchControlProps<T extends ValidComponent = 'input'> = ParentProps<
  SwitchPrimitive.SwitchControlProps<T> & { class?: string | undefined }
>;

const SwitchControl = <T extends ValidComponent = 'input'>(
  props: PolymorphicProps<T, SwitchControlProps<T>>,
) => {
  const [local, others] = splitProps(props as SwitchControlProps, [
    'class',
    'children',
  ]);
  return (
    <>
      <SwitchPrimitive.Input class='[&:focus-visible+div]:outline-none [&:focus-visible+div]:ring-2 [&:focus-visible+div]:ring-ring [&:focus-visible+div]:ring-offset-2 [&:focus-visible+div]:ring-offset-background' />
      <SwitchPrimitive.Control
        class={cn(
          'inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-input shadow-sm transition-colors data-[disabled]:cursor-not-allowed data-[checked]:bg-primary data-[disabled]:opacity-50',
          local.class,
        )}
        {...others}
      >
        {local.children}
      </SwitchPrimitive.Control>
    </>
  );
};

type SwitchThumbProps<T extends ValidComponent = 'div'> = VoidProps<
  SwitchPrimitive.SwitchThumbProps<T> & { class?: string | undefined }
>;

const SwitchThumb = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, SwitchThumbProps<T>>,
) => {
  const [local, others] = splitProps(props as SwitchThumbProps, ['class']);
  return (
    <SwitchPrimitive.Thumb
      class={cn(
        'pointer-events-none block size-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[checked]:translate-x-4 data-[unchecked]:translate-x-0',
        local.class,
      )}
      {...others}
    />
  );
};

type SwitchLabelProps<T extends ValidComponent = 'label'> =
  SwitchPrimitive.SwitchLabelProps<T> & {
    class?: string | undefined;
  };

const SwitchLabel = <T extends ValidComponent = 'label'>(
  props: PolymorphicProps<T, SwitchLabelProps<T>>,
) => {
  const [local, others] = splitProps(props as SwitchLabelProps, ['class']);
  return (
    <SwitchPrimitive.Label
      class={cn(
        'text-sm leading-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-70',
        local.class,
      )}
      {...others}
    />
  );
};

export {
  Switch,
  SwitchControl,
  SwitchThumb,
  SwitchLabel,
  SwitchDescription,
  SwitchErrorMessage,
};
