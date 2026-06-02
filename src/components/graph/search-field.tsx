import { createEffect, createMemo, createSignal, Show } from 'solid-js';
import { SearchIcon, XIcon } from 'lucide-solid';
import { TextField, TextFieldInput } from '../ui/text-field';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { appState } from '../../store';
import { setSelectedFontKey } from '../../actions';
import { useFilteredFontMetadataKeys } from '../../hooks/use-filtered-font-metadata-keys';

interface GraphSearchFieldProps {
  focusRequest: number;
}

export function GraphSearchField(props: GraphSearchFieldProps) {
  const { onQueryChange } = useFilteredFontMetadataKeys({
    onFontSelect: (key) => setSelectedFontKey(key),
  });

  const [inputValue, setInputValue] = createSignal(appState.ui.searchQuery);
  let inputElement: HTMLInputElement | undefined;

  createEffect(() => {
    if (props.focusRequest >= 0) {
      queueMicrotask(() => inputElement?.focus());
    }
  });

  const handleQueryChange = (value: string) => {
    setInputValue(value);
    onQueryChange(value);
  };

  const handleClear = () => {
    setInputValue('');
    onQueryChange('');
  };

  const isFiltered = createMemo(() => appState.ui.searchQuery.length > 0);

  return (
    <TextField class='w-full rounded-md'>
      <div class='relative font-medium'>
        <Show
          when={isFiltered()}
          fallback={
            <SearchIcon class='absolute left-2.5 top-2.5 size-4 text-muted-foreground' />
          }
        >
          <Tooltip>
            <TooltipTrigger
              as={Button<'button'>}
              variant='ghost'
              size='icon'
              class='absolute left-1.5 top-1.5 size-6 rounded-full text-muted-foreground'
              onClick={handleClear}
            >
              <XIcon class='size-3.5' />
            </TooltipTrigger>
            <TooltipContent>Clear</TooltipContent>
          </Tooltip>
        </Show>
        <TextFieldInput
          ref={(element: HTMLInputElement) => {
            inputElement = element;
          }}
          type='text'
          placeholder='Font name, Designer, Foundry, etc...'
          class='h-9 border bg-background pl-8 text-left text-sm placeholder:text-xs hover:bg-background focus:bg-background focus-visible:bg-background'
          value={inputValue()}
          onInput={(e) => handleQueryChange(e.currentTarget.value)}
          spellcheck='false'
        />
      </div>
    </TextField>
  );
}
