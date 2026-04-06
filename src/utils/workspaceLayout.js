const BASE_DESKTOP_VIEWPORT_WIDTH = 1800;
const BASE_SHELL_GUTTER = 24;
const MIN_SHELL_GUTTER = 16;
const MAX_SHELL_GUTTER = 40;
const BASE_WORKSPACE_GAP = 16;
const BASE_CARD_MIN_WIDTH = 220;
const BASE_DECK_IMPORT_CARD_MIN_WIDTH = 176;
const BASE_CARD_IMAGE_MIN_HEIGHT = 324;
const BASE_SHELL_PADDING_Y = 20;
const MAX_DESKTOP_SCALE = 3;
const SIDEBAR_BREAKPOINTS = [
  {
    minViewportWidth: 1920,
    minSidebarWidth: 440,
    targetSidebarRatio: 0.28,
    maxSidebarViewportRatio: 0.3,
  },
  {
    minViewportWidth: 1536,
    minSidebarWidth: 430,
    targetSidebarRatio: 0.31,
    maxSidebarViewportRatio: 0.34,
  },
  {
    minViewportWidth: 1280,
    minSidebarWidth: 420,
    targetSidebarRatio: 0.34,
    maxSidebarViewportRatio: 0.38,
  },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getViewportWidth() {
  if (typeof window === 'undefined' || !Number.isFinite(window.innerWidth) || window.innerWidth <= 0) {
    return BASE_DESKTOP_VIEWPORT_WIDTH;
  }

  return window.innerWidth;
}

export function getResponsiveWorkspaceVars(viewportWidth = BASE_DESKTOP_VIEWPORT_WIDTH) {
  const safeViewportWidth =
    Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : BASE_DESKTOP_VIEWPORT_WIDTH;
  const shellGutter = Math.round(clamp(safeViewportWidth * (BASE_SHELL_GUTTER / BASE_DESKTOP_VIEWPORT_WIDTH), MIN_SHELL_GUTTER, MAX_SHELL_GUTTER));
  const baseShellWidth = BASE_DESKTOP_VIEWPORT_WIDTH - BASE_SHELL_GUTTER * 2;
  const liveShellWidth = Math.max(safeViewportWidth - shellGutter * 2, 320);
  const desktopScale = clamp(liveShellWidth / baseShellWidth, 1, MAX_DESKTOP_SCALE);

  return {
    '--desktop-scale': desktopScale.toFixed(3),
    '--shell-width': `calc(100vw - ${shellGutter * 2}px)`,
    '--shell-padding-y': `${Math.round(BASE_SHELL_PADDING_Y * desktopScale)}px`,
    '--workspace-gap': `${Math.round(BASE_WORKSPACE_GAP * desktopScale)}px`,
    '--card-min-width': `${Math.round(BASE_CARD_MIN_WIDTH * desktopScale)}px`,
    '--deck-import-card-min-width': `${Math.round(BASE_DECK_IMPORT_CARD_MIN_WIDTH * desktopScale)}px`,
    '--card-image-min-height': `${Math.round(BASE_CARD_IMAGE_MIN_HEIGHT * desktopScale)}px`,
  };
}

export function getDesktopWorkspaceColumns(viewportWidth = BASE_DESKTOP_VIEWPORT_WIDTH) {
  const safeViewportWidth =
    Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : BASE_DESKTOP_VIEWPORT_WIDTH;
  const breakpoint = SIDEBAR_BREAKPOINTS.find((entry) => safeViewportWidth >= entry.minViewportWidth);

  if (!breakpoint) {
    return undefined;
  }

  const shellGutter = Math.round(
    clamp(safeViewportWidth * (BASE_SHELL_GUTTER / BASE_DESKTOP_VIEWPORT_WIDTH), MIN_SHELL_GUTTER, MAX_SHELL_GUTTER)
  );
  const shellWidth = Math.max(safeViewportWidth - shellGutter * 2, 320);
  const targetSidebarWidth = shellWidth * breakpoint.targetSidebarRatio;
  const maxSidebarWidth = safeViewportWidth * breakpoint.maxSidebarViewportRatio;
  const sidebarWidth = Math.round(clamp(targetSidebarWidth, breakpoint.minSidebarWidth, maxSidebarWidth));

  return `minmax(${breakpoint.minSidebarWidth}px, ${sidebarWidth}px) minmax(0, 1fr)`;
}
