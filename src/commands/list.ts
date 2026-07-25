import { setAppState } from '@/store';

export const setListPreviewText = (text: string) =>
  setAppState('ui', 'listPreviewText', text);
