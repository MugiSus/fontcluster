import { createMemo, createSignal, Show } from 'solid-js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { FontMetadataList } from './font-metadata-list';
import { FontMetadata } from '../types/font';
import {
  ArrowDownAZ,
  ArrowDownNarrowWide,
  FunnelIcon,
  SearchIcon,
  SearchSlashIcon,
  XIcon,
} from 'lucide-solid';
import { TextField, TextFieldInput } from './ui/text-field';
import { appState } from '../store';
import { setSelectedFontKey } from '../actions';
import { useFilteredFontMetadataKeys } from '../hooks/use-filtered-font-metadata-keys';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export function FontLists() {
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

  const filteredMetadatas = createMemo(() => {
    const data = appState.fonts.data;
    if (Object.keys(data).length === 0) return [];
    return Array.from(appState.fonts.filteredKeys)
      .map((key) => data[key])
      .filter((m): m is FontMetadata => !!m);
  });

  const NoResultsFound = () => (
    <div class='sticky inset-x-0 flex flex-col items-center gap-1 border-b border-dashed py-4 text-center text-sm text-muted-foreground'>
      <SearchSlashIcon />
      No results found
    </div>
  );

  return (
    <Tabs value='similarity' class='flex min-h-0 flex-1 flex-col pr-2'>
      <TextField class='mb-2'>
        <div class='relative'>
          <Show
            when={isFiltered()}
            fallback={
              <SearchIcon class='absolute left-3 top-3 size-4 text-muted-foreground' />
            }
          >
            <Tooltip>
              <TooltipTrigger
                as={Button<'button'>}
                variant='ghost'
                size='icon'
                class='absolute left-1.5 top-1.5 size-7 hover:bg-destructive/10 hover:text-destructive'
                onClick={handleClear}
              >
                <XIcon class='size-4' />
              </TooltipTrigger>
              <TooltipContent>Clear</TooltipContent>
            </Tooltip>
          </Show>
          <TextFieldInput
            type='text'
            placeholder='Search fonts...'
            class='pl-9'
            value={inputValue()}
            onInput={(e) => handleQueryChange(e.currentTarget.value)}
            spellcheck='false'
          />
          <Show when={isFiltered()}>
            <div class='absolute right-3 top-3 flex items-center gap-1 text-xs text-muted-foreground'>
              <FunnelIcon class='size-3' />
              {filteredMetadatas().length}
            </div>
          </Show>
        </div>
      </TextField>

      <TabsList class='grid w-full shrink-0 grid-cols-2 overflow-hidden'>
        <Tooltip>
          <TooltipTrigger as='div' class='w-full'>
            <TabsTrigger
              value='similarity'
              class='relative flex w-full gap-1 pr-5'
            >
              <ArrowDownNarrowWide class='size-4 min-w-4' />
              Similarity
            </TabsTrigger>
          </TooltipTrigger>
          <TooltipContent>Sort by cluster</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as='div' class='w-full'>
            <TabsTrigger value='name' class='relative flex w-full gap-1 pr-5'>
              <ArrowDownAZ class='size-4 min-w-4' />
              Name
            </TabsTrigger>
          </TooltipTrigger>
          <TooltipContent>Sort by name (A-Z)</TooltipContent>
        </Tooltip>
      </TabsList>

      <TabsContent
        value='similarity'
        class='min-h-0 flex-1 overflow-scroll overscroll-x-none rounded-md border bg-slate-100 shadow-sm dark:bg-zinc-900'
      >
        <Show
          when={filteredMetadatas().length > 0}
          fallback={<NoResultsFound />}
        >
          <FontMetadataList
            fontMetadatas={filteredMetadatas()
              .slice()
              .sort((a, b) => {
                const aK = a.computed?.k ?? -1;
                const bK = b.computed?.k ?? -1;
                return (
                  (aK < 0 ? Infinity : aK) - (bK < 0 ? Infinity : bK) ||
                  a.family_name.localeCompare(b.family_name) ||
                  a.weight - b.weight
                );
              })}
            sessionDirectory={appState.session.directory}
            selectedFontKey={appState.ui.selectedFontKey}
            onFontSelect={setSelectedFontKey}
            isSearchResult={isFiltered()}
          />
        </Show>
      </TabsContent>

      <TabsContent
        value='name'
        class='min-h-0 flex-1 overflow-scroll overscroll-x-none rounded-md border bg-slate-100 shadow-sm dark:bg-zinc-900'
      >
        <Show
          when={filteredMetadatas().length > 0}
          fallback={<NoResultsFound />}
        >
          <FontMetadataList
            fontMetadatas={filteredMetadatas()
              .slice()
              .sort(
                (a, b) =>
                  a.family_name.localeCompare(b.family_name) ||
                  a.weight - b.weight,
              )}
            sessionDirectory={appState.session.directory}
            selectedFontKey={appState.ui.selectedFontKey}
            onFontSelect={setSelectedFontKey}
            isSearchResult={isFiltered()}
          />
        </Show>
      </TabsContent>
    </Tabs>
  );
}
