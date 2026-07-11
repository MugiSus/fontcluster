import { type Accessor, createMemo, Show } from 'solid-js';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useI18n, type Locale } from '@/i18n';
import { appState } from '@/store';
import { cn } from '@/lib/utils';
import { getClusterBackgroundColor } from '@/lib/cluster-colors';

/**
 * Picks the display value matching the active locale from a BCP-47-keyed
 * localized-name map, falling back to English and then to any entry.
 */
function pickLocalizedName(
  names: Record<string, string>,
  locale: Locale,
): string | null {
  const entries = Object.entries(names);
  const byTag = (tag: string) =>
    entries.find(([key]) => key === tag || key.startsWith(`${tag}-`));
  return (byTag(locale) ?? byTag('en') ?? entries[0])?.[1] ?? null;
}

interface GraphSelectedFontInfoProps {
  /** The committed selection key (also reflects the in-flight drag target). */
  selectedKey: Accessor<string | null>;
}

/**
 * Info card pinned to the graph's bottom-left corner showing the currently
 * selected font: its rendered sample next to the font name, numeric weight
 * and publisher, with the cluster color as a vertical bar on the left edge
 * (matching the list items).
 */
export function GraphSelectedFontInfo(props: GraphSelectedFontInfoProps) {
  const { t, locale } = useI18n();

  const item = createMemo(() => {
    const key = props.selectedKey();
    return key ? (appState.fonts.displayData[key] ?? null) : null;
  });

  return (
    <Show when={item()}>
      {(font) => {
        const sampleSrc = createMemo(() =>
          convertFileSrc(
            `${appState.sessionDirectory}/samples/${font().meta.safe_name}/sample.png`,
          ),
        );
        const publisher = createMemo(() =>
          pickLocalizedName(font().meta.publishers, locale()),
        );
        const colorIndex = () => font().computed?.clustering?.color_index;

        return (
          <div
            class='pointer-events-auto absolute bottom-0 left-0 z-20 flex max-w-[26rem] items-center gap-3 bg-background/50 py-3 pl-[calc(0.75rem+5px)] pr-4 backdrop-blur-md'
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div
              class={cn(
                'absolute inset-y-0 left-0 w-[5px]',
                getClusterBackgroundColor(colorIndex()),
              )}
            />
            <div class='max-w-56 shrink-0 overflow-hidden'>
              <img
                class='block h-12 w-auto max-w-none mix-blend-darken grayscale invert dark:mix-blend-lighten dark:invert-0'
                src={sampleSrc()}
                alt={t.graph.selectedFontInfo.previewAlt({
                  name: font().meta.font_name,
                })}
                decoding='async'
              />
            </div>
            <div class='flex min-w-0 flex-col gap-0.5'>
              <div class='truncate text-sm font-semibold'>
                {font().meta.font_name}
              </div>
              <div class='truncate text-xs text-muted-foreground'>
                {font().meta.weight}
                <Show when={publisher()}>{(name) => <> · {name()}</>}</Show>
              </div>
            </div>
          </div>
        );
      }}
    </Show>
  );
}
