import { createMemo, Show } from 'solid-js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { FontMetadataList } from './font-metadata-list';
import { FontMetadata } from '../types/font';
import {
  ArrowDownAZ,
  ArrowDownNarrowWide,
  FunnelIcon,
  SearchIcon,
  SearchSlashIcon,
} from 'lucide-solid';
import { TextField, TextFieldInput } from './ui/text-field';
import { state, setState } from '../store';

interface FontListsProps {
  onQueryChange: (query: string) => void;
}

export function FontLists(props: FontListsProps) {
  const isFiltered = createMemo(() => state.ui.searchQuery.length > 0);

  const filteredMetadatas = createMemo(() => {
    const map = state.fonts.map;
    if (map.size === 0) return [];
    return Array.from(state.fonts.filteredKeys)
      .map((key) => map.get(key))
      .filter((m): m is FontMetadata => !!m);
  });

  const NoResultsFound = () => (
    <div class='sticky inset-x-0 flex flex-col items-center gap-1 border-b border-dashed py-4 text-center text-sm text-muted-foreground'>
      <SearchSlashIcon />
      No results found
    </div>
  );

  return (
    <Tabs value='similarity' class='flex min-h-0 flex-1 flex-col'>
      <TextField class='mb-2'>
        <div class='relative'>
          <SearchIcon class='absolute left-3 top-3 size-4 text-muted-foreground' />
          <TextFieldInput
            type='text'
            placeholder='Search fonts...'
            class='pl-9'
            onInput={(e) => props.onQueryChange(e.currentTarget.value)}
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

      <TabsList class='grid w-full shrink-0 grid-cols-2'>
        <TabsTrigger value='similarity' class='relative'>
          <ArrowDownNarrowWide class='absolute left-3 size-4' />
          Similarity
        </TabsTrigger>
        <TabsTrigger value='name' class='relative'>
          <ArrowDownAZ class='absolute left-3 size-4' />
          Name (A-Z)
        </TabsTrigger>
      </TabsList>

      <TabsContent
        value='similarity'
        class='min-h-0 flex-1 overflow-scroll overscroll-x-none rounded-md border bg-muted/20'
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
            sessionDirectory={state.session.directory}
            selectedFontMetadata={state.ui.selectedFont}
            onFontSelect={(font) => setState('ui', 'selectedFont', font)}
            isSearchResult={isFiltered()}
          />
        </Show>
      </TabsContent>

      <TabsContent
        value='name'
        class='min-h-0 flex-1 overflow-scroll overscroll-x-none rounded-md border bg-muted/20'
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
            sessionDirectory={state.session.directory}
            selectedFontMetadata={state.ui.selectedFont}
            onFontSelect={(font) => setState('ui', 'selectedFont', font)}
            isSearchResult={isFiltered()}
          />
        </Show>
      </TabsContent>
    </Tabs>
  );
}
