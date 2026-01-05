import { FontMetadata } from '../types/font';
import Fuse from 'fuse.js';
import { createMemo } from 'solid-js';
import { state, setState } from '../store';

interface useFilteredFontMetadataKeysProps {
  onFontSelect: (fontMetadata: FontMetadata) => void;
}

export function useFilteredFontMetadataKeys(
  props: useFilteredFontMetadataKeysProps,
) {
  let debounceTimer: number | undefined;

  const onQueryChange = (value: string) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      setState('ui', 'searchQuery', value);
    }, 250);
  };

  const fuse = createMemo(() => {
    const fonts = Array.from(state.fonts.map.values());
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
    const q = state.ui.searchQuery;
    const map = state.fonts.map;
    if (map.size === 0) return new Set<string>();

    if (!q) {
      const allKeys = new Set(map.keys());
      setState('fonts', 'filteredKeys', allKeys);
      return allKeys;
    }

    const result = fuse()
      .search(q)
      .map((result) => result.item);

    if (result[0]) props.onFontSelect(result[0]);

    document
      .querySelectorAll(`[data-font-search-result-top]`)
      .forEach((element) => {
        element.scrollIntoView({ behavior: 'instant', block: 'center' });
      });

    const filteredKeys = new Set(result.map((item) => item.safe_name));
    setState('fonts', 'filteredKeys', filteredKeys);
    return filteredKeys;
  });

  return {
    onQueryChange,
    filteredFontMetadataKeys,
  };
}
