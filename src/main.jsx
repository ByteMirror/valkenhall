import { render } from 'preact'
import App from './app.jsx'
import './index.css'
import './print.css'
import { applyThemePreference, getStoredThemePreference } from './utils/themePreference'

applyThemePreference(getStoredThemePreference())

// Overlay scrollbar: show thumb only while scrolling
;(() => {
  const timers = new WeakMap();
  document.addEventListener('scroll', (e) => {
    const el = e.target === document ? document.documentElement : e.target;
    if (!(el instanceof HTMLElement)) return;
    el.classList.add('is-scrolling');
    clearTimeout(timers.get(el));
    timers.set(el, setTimeout(() => el.classList.remove('is-scrolling'), 800));
  }, true);
})();

// Disable native browser right-click context menu.
// Elements with a custom context menu handler (data-custom-context or canvas)
// still work because their handlers call stopPropagation before this fires.
document.addEventListener('contextmenu', (e) => {
  // Allow right-click on text inputs for native copy/paste
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
  e.preventDefault();
});

// Prevent Escape from exiting fullscreen (browser default).
// Capture phase fires before the browser's built-in fullscreen exit handler.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    // The app's own Escape handler in app.jsx will still fire
    // because it listens on the same phase and is registered later.
  }
}, true);

render(<App />, document.getElementById('app'))
