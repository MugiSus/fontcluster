import { FontMetadata, FontMetadataRecord } from '@/types/font';
import Fuse from 'fuse.js';
import { createMemo, createSignal } from 'solid-js';

interface useFilteredFontMetadataArrayProps {
  fontMetadataRecord: () => FontMetadataRecord | undefined;
  onFontSelect: (fontMetadata: FontMetadata) => void;
}

export function useFilteredFontMetadataArray(
  props: useFilteredFontMetadataArrayProps,
) {
  const [query, setQuery] = createSignal('');

  let timeout: ReturnType<typeof setTimeout>;
  const onQueryChange = (value: string) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      setQuery(value);
    }, 300);
  };

  const fuse = createMemo(() => {
    const fonts = Object.values(props.fontMetadataRecord() || {});
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

  const filteredFontMetadatas = createMemo(() => {
    const q = query();
    console.log('filter', q);

    if (!q) return Object.values(props.fontMetadataRecord() || {});

    const result = fuse()
      .search(q)
      .map((result) => result.item);

    if (result[0]) props.onFontSelect(result[0]);

    console.log('results', result);
    document
      .querySelectorAll(`[data-font-search-result-top]`)
      .forEach((element) => {
        element.scrollIntoView({ behavior: 'instant', block: 'center' });
      });

    return result;
  });

  return {
    query,
    onQueryChange,
    filteredFontMetadatas,
  };
}
