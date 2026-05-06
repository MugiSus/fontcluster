import type { ComponentProps } from 'solid-js';
import { splitProps } from 'solid-js';

import {
  NumberField,
  NumberFieldDecrementTrigger,
  NumberFieldGroup,
  NumberFieldIncrementTrigger,
  NumberFieldInput,
  NumberFieldLabel,
} from '../ui/number-field';

type NumberPropertyProps = {
  label: string;
  name: string;
} & Omit<ComponentProps<typeof NumberField>, 'name'>;

export function NumberProperty(props: NumberPropertyProps) {
  const [local, rootProps] = splitProps(props, ['label', 'name']);

  return (
    <NumberField {...rootProps} name={local.name}>
      <NumberFieldGroup>
        <NumberFieldLabel class='absolute inset-y-0 left-2 flex items-center font-medium capitalize'>
          {local.label}
        </NumberFieldLabel>
        <NumberFieldInput name={local.name} />
        <NumberFieldIncrementTrigger />
        <NumberFieldDecrementTrigger />
      </NumberFieldGroup>
    </NumberField>
  );
}
