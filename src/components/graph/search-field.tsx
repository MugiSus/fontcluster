import { createEffect, createMemo, createSignal, Show } from 'solid-js';
import { FunnelIcon, SearchIcon, XIcon } from 'lucide-solid';
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
  const filteredCount = createMemo(() => appState.fonts.filteredKeys.size);

  return (
    <TextField class='w-full'>
      <div class='relative font-medium'>
        <Show
          when={isFiltered()}
          fallback={
            <SearchIcon class='absolute left-2 top-2 size-4 text-muted-foreground' />
          }
        >
          <Tooltip>
            <TooltipTrigger
              as={Button<'button'>}
              variant='ghost'
              size='icon'
              class='absolute left-1 top-1 size-6 rounded-full text-muted-foreground'
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
          placeholder='Search'
          class='h-8 border bg-background px-12 text-center text-sm shadow-none hover:bg-background focus:bg-background focus:placeholder:text-transparent focus-visible:bg-background focus-visible:placeholder:text-transparent'
          value={inputValue()}
          onInput={(e) => handleQueryChange(e.currentTarget.value)}
          spellcheck='false'
        />
        <div class='absolute right-3.5 top-2 flex items-center gap-1 text-xs text-muted-foreground'>
          <Show when={isFiltered()}>
            <FunnelIcon class='size-3' />
          </Show>
          {filteredCount()}
        </div>
      </div>
    </TextField>
  );
}
