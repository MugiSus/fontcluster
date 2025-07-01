/* @refresh reload */
import { render } from 'solid-js/web';

import App from './App';
import './index.css';

render(
  () => (
    <div class='dark'>
      <App />
    </div>
  ),
  document.querySelector('#root') as HTMLElement,
);
