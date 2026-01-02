import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { FontMetadataList } from './font-metadata-list';
import { FontMetadata, FontMetadataRecord } from '../types/font';
import {
  ArrowDownAZ,
  ArrowDownNarrowWide,
  ArrowUpIcon,
  SearchIcon,
  SearchSlashIcon,
} from 'lucide-solid';
import { TextField, TextFieldInput } from './ui/text-field';
import { createMemo, createSignal, Show } from 'solid-js';
import Fuse from 'fuse.js';
import { Button } from './ui/button';

interface FontListsProps {
  fontMetadatas: FontMetadataRecord | undefined;
  sessionDirectory: string;
  selectedFontMetadata: FontMetadata | null;
  onFontClick: (fontMetadata: FontMetadata) => void;
}

export function FontLists(props: FontListsProps) {
  const [searchQuery, setSearchQuery] = createSignal('');

  let timeout: ReturnType<typeof setTimeout>;
  const localSearchQuery = (value: string) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      setSearchQuery(value);
    }, 300);
  };

  const fuse = createMemo(() => {
    const fonts = Object.values(props.fontMetadatas || {});
    return new Fuse(fonts, {
      keys: [
        'font_name',
        'family_name',
        'family_names',
        'preferred_family_names',
        'publishers',
        'designers',
        {
          name: 'family_names_list',
          getFn: (item) => Object.values(item.family_names),
        },
        {
          name: 'preferred_family_names_list',
          getFn: (item) => Object.values(item.preferred_family_names),
        },
        {
          name: 'publishers_list',
          getFn: (item) => Object.values(item.publishers),
        },
        {
          name: 'designers_list',
          getFn: (item) => Object.values(item.designers),
        },
      ],
      threshold: 0.4,
    });
  });

  const filteredFonts = createMemo(() => {
    const query = searchQuery();
    if (!query) return Object.values(props.fontMetadatas || {});

    const result = fuse()
      .search(query)
      .map((result) => result.item);

    if (result[0]) {
      props.onFontClick(result[0]);
      document
        .querySelectorAll(`[data-font-search-result-top]`)
        .forEach((element) => {
          element.scrollIntoView({ behavior: 'instant', block: 'center' });
        });
    }

    return result;
  });

  const FontSearchResultList = () => {
    return (
      <Show when={searchQuery()}>
        <Show
          when={filteredFonts().length > 0}
          fallback={
            <div class='sticky inset-x-0 flex flex-col items-center gap-1 border-b border-dashed py-4 text-center text-sm text-muted-foreground'>
              <SearchSlashIcon />
              No results found
            </div>
          }
        >
          <div data-font-search-result-top />
          <FontMetadataList
            fontMetadatas={filteredFonts()}
            sessionDirectory={props.sessionDirectory}
            selectedFontMetadata={props.selectedFontMetadata}
            onFontClick={props.onFontClick}
          />
          <div class='sticky inset-x-0 inset-y-1 flex items-center justify-center py-1'>
            <Button
              size='sm'
              variant='outline'
              class='flex h-7 items-center gap-1 rounded-full bg-background px-2 shadow-sm'
              onClick={() => {
                document
                  .querySelectorAll(`[data-font-search-result-top]`)
                  .forEach((element) => {
                    element.scrollIntoView({
                      behavior: 'smooth',
                      block: 'center',
                    });
                  });
              }}
            >
              <ArrowUpIcon class='size-4' />
              <p class='pt-px text-sm font-light'>Search results</p>
              <ArrowUpIcon class='size-4' />
            </Button>
          </div>
        </Show>
      </Show>
    );
  };

  return (
    <Tabs value='similarity' class='flex min-h-0 flex-1 flex-col'>
      <TextField class='mb-2'>
        <div class='relative'>
          <SearchIcon class='absolute left-3 top-3 size-4 text-muted-foreground' />
          <TextFieldInput
            type='text'
            placeholder='Search fonts...'
            class='pl-9'
            onInput={(e) => localSearchQuery(e.currentTarget.value)}
            spellcheck='false'
          />
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
        <FontSearchResultList />
        <FontMetadataList
          fontMetadatas={Object.values(props.fontMetadatas || {}).sort(
            (a, b) => {
              const aK = a.computed?.k ?? -1;
              const bK = b.computed?.k ?? -1;
              return (
                (aK < 0 ? Infinity : aK) - (bK < 0 ? Infinity : bK) ||
                a.family_name.localeCompare(b.family_name) ||
                a.weight - b.weight
              );
            },
          )}
          sessionDirectory={props.sessionDirectory}
          selectedFontMetadata={props.selectedFontMetadata}
          onFontClick={props.onFontClick}
        />
      </TabsContent>

      <TabsContent
        value='name'
        class='min-h-0 flex-1 overflow-scroll overscroll-x-none rounded-md border bg-muted/20'
      >
        <FontSearchResultList />
        <FontMetadataList
          fontMetadatas={Object.values(props.fontMetadatas || {}).sort(
            (a, b) =>
              a.family_name.localeCompare(b.family_name) || a.weight - b.weight,
          )}
          sessionDirectory={props.sessionDirectory}
          selectedFontMetadata={props.selectedFontMetadata}
          onFontClick={props.onFontClick}
        />
      </TabsContent>
    </Tabs>
  );
}
