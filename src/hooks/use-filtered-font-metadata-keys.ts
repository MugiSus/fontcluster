import { FontMetadata } from '../types/font';
import Fuse from 'fuse.js';
import { createMemo, createSignal, Accessor } from 'solid-js';

interface useFilteredFontMetadataKeysProps {
  fontMetadataMap: Accessor<Map<string, FontMetadata> | undefined>;
  onFontSelect: (fontMetadata: FontMetadata) => void;
}

export function useFilteredFontMetadataKeys(
  props: useFilteredFontMetadataKeysProps,
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
    const fonts = Array.from(props.fontMetadataMap()?.values() || []);
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

  const filteredFontMetadataKeys = createMemo(() => {
    const q = query();
    const map = props.fontMetadataMap();
    if (!map) return new Set<string>();

    if (!q) return new Set(map.keys());

    const result = fuse()
      .search(q)
      .map((result) => result.item);

    if (result[0]) props.onFontSelect(result[0]);

    document
      .querySelectorAll(`[data-font-search-result-top]`)
      .forEach((element) => {
        element.scrollIntoView({ behavior: 'instant', block: 'center' });
      });

    return new Set(result.map((item) => item.safe_name));
  });

  return {
    query,
    onQueryChange,
    filteredFontMetadataKeys,
  };
}
