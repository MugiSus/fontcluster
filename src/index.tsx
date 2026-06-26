/* @refresh reload */
import { render } from 'solid-js/web';
import { ColorModeProvider, ColorModeScript } from '@kobalte/core';

import '@fontsource-variable/geist';
import '@fontsource-variable/noto-sans-jp';

import App from './App';
import { I18nProvider } from './i18n';
import { themeStorageManager } from './theme';
import './index.css';

function Root() {
  return (
    <>
      <ColorModeScript storageType={themeStorageManager.type} />
      <ColorModeProvider storageManager={themeStorageManager}>
        <div class='flex h-screen flex-col overflow-hidden overscroll-none bg-background font-sans'>
          <I18nProvider>
            <App />
          </I18nProvider>
        </div>
      </ColorModeProvider>
    </>
  );
}

render(() => <Root />, document.querySelector('#root') as HTMLElement);
