import { createEffect, createSignal, onCleanup, Show } from 'solid-js';
import { SwatchBookIcon, XIcon } from 'lucide-solid';
import { TextField, TextFieldInput } from '@/components/ui/text-field';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
    }, 500);
  };

  const handleClear = () => {
    setInputValue('');
    if (debounceTimer) window.clearTimeout(debounceTimer);
    onValueChange('');
  };

  onCleanup(() => {
    if (debounceTimer) window.clearTimeout(debounceTimer);
  });

  return (
    <TextField class='relative w-full gap-0'>
      <Show
        when={inputValue().length > 0}
        fallback={
          <SwatchBookIcon class='absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
        }
      >
        <Tooltip>
          <TooltipTrigger
            as={Button<'button'>}
            type='button'
            variant='ghost'
            size='icon'
            class='absolute left-3 top-3 size-6 rounded-full text-muted-foreground'
            onClick={handleClear}
          >
            <XIcon class='size-3.5' />
          </TooltipTrigger>
          <TooltipContent>Clear</TooltipContent>
        </Tooltip>
      </Show>
      <TextFieldInput
        type='text'
        value={inputValue()}
        placeholder={props.placeholder}
        onInput={(event) => handleValueChange(event.currentTarget.value)}
        class='h-12 rounded-none border-0 border-b bg-background pl-12 pr-0 text-left text-sm shadow-none hover:bg-background focus:bg-background focus:outline-none'
        spellcheck='false'
      />
    </TextField>
  );
}
