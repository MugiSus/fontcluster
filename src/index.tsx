/* @refresh reload */
import { render } from 'solid-js/web';
import {
  ColorModeProvider,
  ColorModeScript,
  createLocalStorageManager,
} from '@kobalte/core';

import App from './App';
import './index.css';
import { Titlebar } from './components/titlebar';

function Root() {
  const storageManager = createLocalStorageManager('vite-ui-theme');

  return (
    <>
      <ColorModeScript storageType={storageManager.type} />
      <ColorModeProvider storageManager={storageManager}>
        <div class='flex h-screen flex-col overflow-auto overscroll-none bg-background text-center'>
          <Titlebar />
          <App />
        </div>
      </ColorModeProvider>
    </>
  );
}

render(() => <Root />, document.querySelector('#root') as HTMLElement);
