import { createEffect, on } from 'solid-js';
import { debounce } from '@solid-primitives/scheduled';
import { appState, setAppState } from '@/store';

interface useFilteredFontMetadataKeysProps {
  onFontSelect: (key: string) => void;
}

export function useFilteredFontMetadataKeys(
  props: useFilteredFontMetadataKeysProps,
) {
  const updateSearchQuery = debounce((value: string) => {
    setAppState('ui', 'searchQuery', value);
  }, 500);

  const onQueryChange = (value: string) => {
    if (value === '') {
      updateSearchQuery.clear();
      setAppState('ui', 'searchQuery', '');
      return;
    }
    updateSearchQuery(value);
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
        const firstItem = firstKey
          ? appState.fonts.displayData[firstKey]
          : null;

        if (firstItem) {
          props.onFontSelect(firstItem.meta.safe_name);

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
