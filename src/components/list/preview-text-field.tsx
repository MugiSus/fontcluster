import { createEffect, createSignal, onCleanup } from 'solid-js';
import { SwatchBookIcon } from 'lucide-solid';
import { TextField, TextFieldInput } from '@/components/ui/text-field';

const PREVIEW_TEXT_DEBOUNCE_MS = 250;

interface ListPreviewTextFieldProps {
  value: string;
  placeholder: string;
  onValueChange: (value: string) => void;
}

export function ListPreviewTextField(props: ListPreviewTextFieldProps) {
  const [inputValue, setInputValue] = createSignal('');
  let onValueChange: (value: string) => void = () => {};
  let debounceTimer: number | undefined;

  createEffect(() => {
    onValueChange = props.onValueChange;
    setInputValue(props.value);
  });

  const handleValueChange = (value: string) => {
    setInputValue(value);
    if (debounceTimer) window.clearTimeout(debounceTimer);
    if (value === '') {
      onValueChange('');
      return;
    }
    debounceTimer = window.setTimeout(() => {
      onValueChange(value);
    }, PREVIEW_TEXT_DEBOUNCE_MS);
  };

  onCleanup(() => {
    if (debounceTimer) window.clearTimeout(debounceTimer);
  });

  return (
    <TextField class='w-full gap-0'>
      <div class='relative'>
        <SwatchBookIcon class='absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
        <TextFieldInput
          type='text'
          value={inputValue()}
          placeholder={props.placeholder}
          onInput={(event) => handleValueChange(event.currentTarget.value)}
          class='h-12 rounded-none border-0 border-b bg-background pl-10 pr-4 text-left text-sm shadow-none hover:bg-background focus:bg-background focus:outline-none'
          spellcheck='false'
        />
      </div>
    </TextField>
  );
}
