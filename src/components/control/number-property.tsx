import type { ComponentProps } from 'solid-js';
import { splitProps } from 'solid-js';

import {
  NumberField,
  NumberFieldDecrementTrigger,
  NumberFieldGroup,
  NumberFieldIncrementTrigger,
  NumberFieldInput,
} from '../ui/number-field';

type NumberPropertyProps = {
  label: string;
} & ComponentProps<typeof NumberField>;

export function NumberProperty(props: NumberPropertyProps) {
  const [local, rootProps] = splitProps(props, ['label']);

  return (
    <NumberField {...rootProps}>
      <NumberFieldGroup>
        <NumberFieldInput />
        <NumberFieldIncrementTrigger />
        <NumberFieldDecrementTrigger />
      </NumberFieldGroup>
    </NumberField>
  );
}
