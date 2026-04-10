import { render } from 'preact'
import App from './app.jsx'
import './index.css'
import './print.css'
import { applyThemePreference, getStoredThemePreference } from './utils/themePreference'
import { applyBrightness, onGraphicsChange } from './utils/game/graphicsSettings'

applyThemePreference(getStoredThemePreference())

// Apply the saved brightness on startup, and re-apply whenever the user
// adjusts the slider in Settings. The CSS filter on <html> covers the
// entire viewport — 3D canvas and 2D UI alike.
applyBrightness();
onGraphicsChange(() => applyBrightness());

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

// Disable browser-level zoom: trackpad pinch, Ctrl/Cmd + wheel, and the
// Ctrl/Cmd + (+/-/0) keyboard shortcuts. Valkenhall is a desktop game, not
// a web page — the medieval theme has its own viewport scale system, and a
// stray pinch-to-zoom would warp the entire UI out of alignment.
// Chromium delivers trackpad pinch as a `wheel` event with `ctrlKey: true`,
// so a single wheel listener catches both the gesture and the modifier+wheel.
window.addEventListener('wheel', (e) => {
  if (e.ctrlKey) e.preventDefault();
}, { passive: false, capture: true });

window.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey)) return;
  // `=` covers Cmd+= which most keyboards send for "zoom in" (no Shift required).
  if (e.key === '+' || e.key === '-' || e.key === '_' || e.key === '=' || e.key === '0') {
    e.preventDefault();
  }
}, true);

// Safari-style gesture events. Chromium normally suppresses these, but on
// some macOS builds it forwards them — defensive coverage costs nothing.
['gesturestart', 'gesturechange', 'gestureend'].forEach((evt) => {
  document.addEventListener(evt, (e) => e.preventDefault());
});

// Disable native browser tooltips globally.
// The browser renders a tooltip for any element with a `title` attribute, which
// looks out of place in a game. Strip `title` on insertion and on mutation so
// Preact renders, third-party components (sonner, framer-motion, shadcn), and
// runtime-added titles are all covered without hardcoding per element.
;(() => {
  const stripTitlesIn = (node) => {
    if (node.nodeType !== 1) return;
    if (node.hasAttribute('title')) node.removeAttribute('title');
    const descendants = node.querySelectorAll('[title]');
    for (let i = 0; i < descendants.length; i++) descendants[i].removeAttribute('title');
  };

  stripTitlesIn(document.documentElement);

  new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
      if (m.type === 'attributes') {
        m.target.removeAttribute('title');
      } else {
        m.addedNodes.forEach(stripTitlesIn);
      }
    }
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['title'],
  });
})();

render(<App />, document.getElementById('app'))
