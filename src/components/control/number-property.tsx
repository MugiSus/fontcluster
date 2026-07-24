import type { ComponentProps } from 'solid-js';
import { splitProps } from 'solid-js';

import {
  NumberField,
  NumberFieldDecrementTrigger,
  NumberFieldGroup,
  NumberFieldIncrementTrigger,
  NumberFieldInput,
  NumberFieldLabel,
} from '@/components/ui/number-field';

type NumberPropertyProps = {
  label: string;
  name: string;
  isChanged?: boolean;
} & Omit<ComponentProps<typeof NumberField>, 'name'>;

export function NumberProperty(props: NumberPropertyProps) {
  const [local, rootProps] = splitProps(props, ['label', 'name', 'isChanged']);

  return (
    <NumberField {...rootProps} name={local.name}>
      <NumberFieldGroup>
        <NumberFieldLabel
          class='absolute inset-y-0 left-2 flex items-center font-medium capitalize'
          classList={{ '!text-primary': local.isChanged }}
        >
          {local.label}
        </NumberFieldLabel>
        <NumberFieldInput
          name={local.name}
          classList={{ '!text-primary': local.isChanged }}
        />
        <NumberFieldIncrementTrigger />
        <NumberFieldDecrementTrigger />
      </NumberFieldGroup>
    </NumberField>
  );
}
