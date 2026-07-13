import { Show, createResource, onCleanup } from 'solid-js';
import { AlertCircleIcon, LoaderIcon } from 'lucide-solid';
import { toast } from 'solid-sonner';
import { setGraphSessionPayload } from '@/actions/graph';
import { GraphContent } from '@/components/graph/content';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { useI18n } from '@/i18n';
import { selectionHistory } from '@/selection-history';
import { appState } from '@/store';
import { type CopySelectedFont } from '@/components/graph/types';
import { loadFontClusterDocument } from './load-fontcluster-document';
import { WebUtilityControls } from './utility-controls';

const BUNDLED_DOCUMENT_URL = new URL(
  '../../src-tauri/resources/example/019f4fe9-6dd2-79b3-a70f-557821be0a5f.fontclusterdoc',
  import.meta.url,
).href;

export function WebApp() {
  const { t } = useI18n();
  const [graphDocument, { refetch }] = createResource(async () => {
    const loadedDocument = await loadFontClusterDocument(
      import.meta.env['VITE_FONTCLUSTER_DOCUMENT_URL'] || BUNDLED_DOCUMENT_URL,
    );
    setGraphSessionPayload({
      config: loadedDocument.config,
      directory: '',
      fonts: loadedDocument.fonts,
      dendrogram: loadedDocument.dendrogram,
    });
    selectionHistory.reset();
    return loadedDocument;
  });

  onCleanup(() => graphDocument()?.dispose());

  const copySelectedFont: CopySelectedFont = (options) => {
    const selectedFont = appState.ui.selectedFont;
    if (!selectedFont) return;
    const name = options.isFontName
      ? selectedFont.meta.font_name
      : selectedFont.meta.family_name;
    void navigator.clipboard.writeText(name).then(
      () => {
        if (options.showToast) {
          toast.success(t.list.toasts.copied({ name }));
        }
      },
      (error: unknown) => {
        console.error('Failed to copy font name:', error);
        toast.error(t.list.toasts.copyFailed());
      },
    );
  };

  return (
    <main class='relative size-full overflow-hidden bg-background'>
      <Toaster position='bottom-center' />
      <Show
        when={graphDocument()}
        fallback={
          <div class='flex size-full items-center justify-center p-6'>
            <Show
              when={graphDocument.error}
              fallback={
                <div class='flex items-center gap-2 text-sm text-muted-foreground'>
                  <LoaderIcon class='size-4 animate-spin' />
                  <span>{t.webViewer.loading()}</span>
                </div>
              }
            >
              <div class='flex max-w-md flex-col items-center gap-4 text-center'>
                <AlertCircleIcon class='size-8 text-muted-foreground' />
                <div>
                  <p class='text-sm'>{t.webViewer.loadFailed()}</p>
                  <p class='mt-1 break-words text-xs text-muted-foreground'>
                    {String(graphDocument.error)}
                  </p>
                </div>
                <Button variant='outline' size='sm' onClick={() => refetch()}>
                  {t.webViewer.retry()}
                </Button>
              </div>
            </Show>
          </div>
        }
      >
        {(document) => (
          <GraphContent
            sessionKey={document().sessionKey}
            sampleImageUrl={document().sampleImageUrl}
            copySelectedFont={copySelectedFont}
          />
        )}
      </Show>
      <WebUtilityControls />
    </main>
  );
}
