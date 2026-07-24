import { JSX, splitProps } from 'solid-js';

import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
  type TextFieldInputProps,
} from '@/components/ui/text-field';

type TextPropertyProps = {
  label: string;
  isChanged?: boolean;
  children?: JSX.Element;
} & JSX.InputHTMLAttributes<HTMLInputElement> &
  TextFieldInputProps<'input'>;

export function TextProperty(props: TextPropertyProps) {
  const [local, inputProps] = splitProps(props, [
    'label',
    'class',
    'children',
    'isChanged',
  ]);

  return (
    <TextField class='relative'>
      <TextFieldLabel
        class='absolute inset-y-0 left-2 flex items-center font-medium capitalize'
        classList={{ '!text-primary': local.isChanged }}
      >
        {local.label}
      </TextFieldLabel>
      {local.children ?? (
        <TextFieldInput
          {...inputProps}
          classList={{ '!text-primary': local.isChanged }}
        />
      )}
    </TextField>
  );
}
