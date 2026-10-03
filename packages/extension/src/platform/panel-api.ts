import './polyfill';
import { IS_SAFARI } from './target';
import { createInspectorBrowser } from '../inspector/bridge-client';

const nativeBrowser = globalThis.browser;
export const browser: typeof chrome = IS_SAFARI
  ? createInspectorBrowser(nativeBrowser) as unknown as typeof chrome
  : nativeBrowser;
