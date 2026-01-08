import { createEffect, on } from 'solid-js';
import { appState, setAppState } from '../store';

interface useFilteredFontMetadataKeysProps {
  onFontSelect: (key: string) => void;
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

  // Handle side effects (scroll into view and callback)
  // when the filtered keys in the store change
  createEffect(
    on(
      () => appState.fonts.filteredKeys,
      (keys) => {
        const q = appState.ui.searchQuery;
        if (!q) return;

        const firstKey = Array.from(keys)[0];
        const firstMetadata = firstKey ? appState.fonts.data[firstKey] : null;

        if (firstMetadata) {
          props.onFontSelect(firstMetadata.safe_name);

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
    filteredFontMetadataKeys: () => appState.fonts.filteredKeys,
  };
}
