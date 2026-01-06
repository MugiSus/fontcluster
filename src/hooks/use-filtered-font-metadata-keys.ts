import { FontMetadata } from '../types/font';
import Fuse from 'fuse.js';
import { createMemo, createEffect, on } from 'solid-js';
import { appState, setAppState } from '../store';

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
      setAppState('ui', 'searchQuery', value);
    }, 250);
  };

  const fuse = createMemo(() => {
    const fonts = Array.from(appState.fonts.map.values());
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
    const q = appState.ui.searchQuery;
    const map = appState.fonts.map;
    if (map.size === 0) return new Set<string>();

    if (!q) {
      return new Set(map.keys());
    }

    const result = fuse()
      .search(q)
      .map((result) => result.item);

    return new Set(result.map((item) => item.safe_name));
  });

  // Handle side effects (store updates and DOM manipulation) in createEffect
  createEffect(
    on(
      () => filteredFontMetadataKeys(),
      (keys) => {
        // 1. Sync store
        setAppState('fonts', 'filteredKeys', keys);

        // 2. Additional side effects only when searching
        const q = appState.ui.searchQuery;
        if (!q) return;

        // Find the first metadata for callbacks/scroll
        const firstKey = Array.from(keys)[0];
        const firstMetadata = firstKey
          ? appState.fonts.map.get(firstKey)
          : null;

        if (firstMetadata) {
          props.onFontSelect(firstMetadata);

          // Scroll into view
          requestAnimationFrame(() => {
            document
              .querySelectorAll(`[data-font-search-result-top]`)
              .forEach((element) => {
                element.scrollIntoView({
                  behavior: 'instant',
                  block: 'center',
                });
              });
          });
        }
      },
    ),
  );

  return {
    onQueryChange,
    filteredFontMetadataKeys,
  };
}
