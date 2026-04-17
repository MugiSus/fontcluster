import { JSX, splitProps } from 'solid-js';

import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
  type TextFieldInputProps,
} from './ui/text-field';

type ControlPropertyProps = {
  label: string;
  children?: JSX.Element;
} & JSX.InputHTMLAttributes<HTMLInputElement> &
  TextFieldInputProps<'input'>;

export function ControlProperty(props: ControlPropertyProps) {
  const [local, inputProps] = splitProps(props, ['label', 'class', 'children']);

  return (
    <TextField class='relative'>
      <TextFieldLabel class='absolute inset-y-0 left-2 flex items-center font-medium'>
        {local.label}
      </TextFieldLabel>
      {local.children ?? <TextFieldInput {...inputProps} />}
    </TextField>
  );
}
