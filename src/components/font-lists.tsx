import { createMemo, Show } from 'solid-js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { FontMetadataList } from './font-metadata-list';
import { FontMetadata } from '../types/font';
import {
  ArrowDownAZ,
  ArrowDownNarrowWide,
  SearchSlashIcon,
} from 'lucide-solid';
import { appState } from '../store';
import { setSelectedFontKey } from '../actions';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export function FontLists() {
  const isFiltered = createMemo(() => appState.ui.searchQuery.length > 0);

  const filteredMetadatas = createMemo(() => {
    const data = appState.fonts.data;
    if (Object.keys(data).length === 0) return [];
    return Array.from(appState.fonts.filteredKeys)
      .map((key) => data[key])
      .filter((m): m is FontMetadata => !!m);
  });

  const similaritySortedMetadatas = createMemo(() => {
    return filteredMetadatas().toSorted((a, b) => {
      const aK = a.computed?.k ?? -1;
      const bK = b.computed?.k ?? -1;
      return (
        (aK < 0 ? Infinity : aK) - (bK < 0 ? Infinity : bK) ||
        a.family_name.localeCompare(b.family_name) ||
        a.weight - b.weight
      );
    });
  });

  const nameSortedMetadatas = createMemo(() => {
    return filteredMetadatas().toSorted(
      (a, b) =>
        a.family_name.localeCompare(b.family_name) || a.weight - b.weight,
    );
  });

  const NoResultsFound = () => (
    <div class='sticky inset-x-0 flex flex-col items-center gap-1 border-b border-dashed py-4 text-center text-sm text-muted-foreground'>
      <SearchSlashIcon />
      No results found
    </div>
  );

  return (
    <Tabs value='similarity' class='flex min-h-0 flex-1 flex-col pr-2'>
      <TabsList class='grid w-full shrink-0 grid-cols-2 overflow-hidden'>
        <Tooltip>
          <TooltipTrigger as='div' class='w-full'>
            <TabsTrigger
              value='similarity'
              class='relative flex w-full gap-2 pr-4'
            >
              <ArrowDownNarrowWide class='size-4 min-w-4 text-muted-foreground' />
              Similarity
            </TabsTrigger>
          </TooltipTrigger>
          <TooltipContent>Sort by cluster</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as='div' class='w-full'>
            <TabsTrigger value='name' class='relative flex w-full gap-2 pr-4'>
              <ArrowDownAZ class='size-4 min-w-4 text-muted-foreground' />
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
            fontMetadatas={similaritySortedMetadatas()}
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
            fontMetadatas={nameSortedMetadatas()}
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
