/* @refresh reload */
import { render } from 'solid-js/web';
import {
  ColorModeProvider,
  ColorModeScript,
  createLocalStorageManager,
} from '@kobalte/core';

import '@fontsource/noto-sans/400.css';
import '@fontsource-variable/geist';

import App from './App';
import './index.css';

function Root() {
  const storageManager = createLocalStorageManager('vite-ui-theme');

  return (
    <>
      <ColorModeScript storageType={storageManager.type} />
      <ColorModeProvider storageManager={storageManager}>
        <div class='flex h-screen flex-col overflow-hidden overscroll-none bg-background font-sans'>
          <App />
        </div>
      </ColorModeProvider>
    </>
  );
}

render(() => <Root />, document.querySelector('#root') as HTMLElement);
