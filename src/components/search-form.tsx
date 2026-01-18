import { createMemo, createSignal, Show } from 'solid-js';
import { FunnelIcon, SearchIcon, XIcon } from 'lucide-solid';
import { TextField, TextFieldInput } from './ui/text-field';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { appState } from '../store';
import { setSelectedFontKey } from '../actions';
import { useFilteredFontMetadataKeys } from '../hooks/use-filtered-font-metadata-keys';

export function SearchForm() {
  const { onQueryChange } = useFilteredFontMetadataKeys({
    onFontSelect: (key) => setSelectedFontKey(key),
  });

  const [inputValue, setInputValue] = createSignal(appState.ui.searchQuery);

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
      <div class='relative'>
        <Show
          when={isFiltered()}
          fallback={
            <SearchIcon class='absolute left-2.5 top-1.5 size-4 text-muted-foreground' />
          }
        >
          <Tooltip>
            <TooltipTrigger
              as={Button<'button'>}
              variant='ghost'
              size='icon'
              class='absolute left-1 top-1 size-6 hover:bg-destructive/10 hover:text-destructive'
              onClick={handleClear}
            >
              <XIcon class='size-3.5' />
            </TooltipTrigger>
            <TooltipContent>Clear</TooltipContent>
          </Tooltip>
        </Show>
        <TextFieldInput
          type='text'
          placeholder='Search fonts...'
          class='h-8 pl-8 pr-12 text-xs'
          value={inputValue()}
          onInput={(e) => handleQueryChange(e.currentTarget.value)}
          spellcheck='false'
        />
        <Show when={isFiltered()}>
          <div class='absolute right-2 top-2 flex items-center gap-1 text-xxs text-muted-foreground'>
            <FunnelIcon class='size-2.5' />
            {filteredCount()}
          </div>
        </Show>
      </div>
    </TextField>
  );
}
