import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { FontMetadataList } from './font-metadata-list';
import { FontMetadata, FontMetadataRecord } from '../types/font';
import { SearchIcon } from 'lucide-solid';
import { TextField, TextFieldInput } from './ui/text-field';
import { createMemo, createSignal } from 'solid-js';
import Fuse from 'fuse.js';

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
    }, 500);
  };

  const fuse = createMemo(() => {
    const fonts = Object.values(props.fontMetadatas || {});
    return new Fuse(fonts, {
      keys: ['font_name', 'family_name'],
      threshold: 0.6,
    });
  });

  const filteredFonts = createMemo(() => {
    const query = searchQuery();
    if (!query) return Object.values(props.fontMetadatas || {});

    return fuse()
      .search(query)
      .map((result) => result.item);
  });

  return (
    <Tabs value='similarity' class='flex min-h-0 flex-1 flex-col'>
      <TextField class='mb-2'>
        <div class='relative'>
          <SearchIcon class='absolute left-2.5 top-2.5 size-4 text-muted-foreground' />
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
        <TabsTrigger value='similarity'>Similarity</TabsTrigger>
        <TabsTrigger value='name'>Name (A-Z)</TabsTrigger>
      </TabsList>

      <TabsContent
        value='name'
        class='min-h-0 flex-1 overflow-scroll rounded-md border'
      >
        <FontMetadataList
          fontMetadatas={filteredFonts().sort(
            (a, b) =>
              a.family_name.localeCompare(b.family_name) || a.weight - b.weight,
          )}
          sessionDirectory={props.sessionDirectory}
          selectedFontMetadata={props.selectedFontMetadata}
          onFontClick={props.onFontClick}
        />
      </TabsContent>

      <TabsContent
        value='similarity'
        class='min-h-0 flex-1 overflow-scroll rounded-md border'
      >
        <FontMetadataList
          fontMetadatas={filteredFonts().sort((a, b) => {
            const aK = a.computed?.k ?? -1;
            const bK = b.computed?.k ?? -1;
            return (
              (aK < 0 ? Infinity : aK) - (bK < 0 ? Infinity : bK) ||
              a.family_name.localeCompare(b.family_name) ||
              a.weight - b.weight
            );
          })}
          sessionDirectory={props.sessionDirectory}
          selectedFontMetadata={props.selectedFontMetadata}
          onFontClick={props.onFontClick}
        />
      </TabsContent>
    </Tabs>
  );
}
