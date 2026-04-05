import { readFileSync } from 'node:fs';
import { createRef } from 'preact';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { describe, expect, it, mock, vi } from 'bun:test';
import * as actualImageQuality from './utils/imageQuality';

const sonnerToastFn = vi.fn();
const sonnerToastMocks = Object.assign(sonnerToastFn, {
  loading: vi.fn(() => 'toast-download'),
  success: vi.fn(),
  error: vi.fn(),
  dismiss: vi.fn(),
});

mock.module('sonner', () => ({
  toast: sonnerToastMocks,
  Toaster: () => <div data-testid="sonner-toaster" />,
}));

const upscaylMocks = {
  upscaleImageUrl: vi.fn(async () => ({ blob: new Blob(['upscaled'], { type: 'image/png' }), cacheUrl: '/api/upscale/cached/abc123.webp' })),
  blobToObjectUrl: vi.fn(() => 'blob:upscaled-card'),
  blobToDataUrl: vi.fn(async () => 'data:image/png;base64,dXBzY2FsZWQ='),
};

mock.module('./utils/upscaylApi', () => ({
  upscaleImageUrl: upscaylMocks.upscaleImageUrl,
  blobToObjectUrl: upscaylMocks.blobToObjectUrl,
  blobToDataUrl: upscaylMocks.blobToDataUrl,
}));

function getDimensions(imageUrl) {
  if (String(imageUrl || '').includes('blob:upscaled-card')) {
    return { width: 1600, height: 2240, pixels: 3584000 };
  }

  return { width: 400, height: 560, pixels: 224000 };
}

const imageQualityMocks = {
  measureImageDimensions: vi.fn(async (imageUrl) => getDimensions(imageUrl)),
  rankPrintingsByResolution: vi.fn(async (card) =>
    (card?.printings || []).map((printing) => ({
      printing,
      ...getDimensions(printing?.image_url),
    }))
  ),
  selectPrintingNewestMeeting300: vi.fn(async (card) => card?.printings?.[card.printings.length - 1] || null),
};

mock.module('./utils/imageQuality', () => ({
    ...actualImageQuality,
    measureImageDimensions: imageQualityMocks.measureImageDimensions,
    rankPrintingsByResolution: imageQualityMocks.rankPrintingsByResolution,
    selectPrintingNewestMeeting300: imageQualityMocks.selectPrintingNewestMeeting300,
}));

const { default: App } = await import('./app.jsx');

const sampleCards = [
  {
    unique_id: 'card-1',
    name: 'Command and Conquer',
    pitch: '1',
    types: ['Generic', 'Attack Action'],
    played_horizontally: false,
    printings: [
      {
        unique_id: 'printing-1',
        image_url: 'https://example.com/card-1.png',
        image_rotation_degrees: 0,
      },
    ],
  },
];

const categorizedCards = [
  {
    unique_id: 'hero-card',
    name: 'Filter Hero',
    pitch: '',
    types: ['Hero'],
    played_horizontally: false,
    printings: [{ unique_id: 'hero-printing', image_url: 'https://example.com/hero.png', image_rotation_degrees: 0 }],
  },
  {
    unique_id: 'gear-card',
    name: 'Filter Equipment',
    pitch: '',
    types: ['Equipment'],
    played_horizontally: false,
    printings: [{ unique_id: 'gear-printing', image_url: 'https://example.com/gear.png', image_rotation_degrees: 0 }],
  },
  {
    unique_id: 'ally-card',
    name: 'Filter Ally',
    pitch: '',
    types: ['Ally'],
    played_horizontally: false,
    printings: [{ unique_id: 'ally-printing', image_url: 'https://example.com/ally.png', image_rotation_degrees: 0 }],
  },
  {
    unique_id: 'sideboard-card',
    name: 'Filter Sideboard',
    pitch: '',
    types: ['Action'],
    played_horizontally: false,
    printings: [{ unique_id: 'sideboard-printing', image_url: 'https://example.com/sideboard.png', image_rotation_degrees: 0 }],
  },
  {
    unique_id: 'red-card',
    name: 'Filter Red',
    pitch: '1',
    types: ['Attack Action'],
    played_horizontally: false,
    printings: [{ unique_id: 'red-printing', image_url: 'https://example.com/red.png', image_rotation_degrees: 0 }],
  },
  {
    unique_id: 'yellow-card',
    name: 'Filter Yellow',
    pitch: '2',
    types: ['Attack Action'],
    played_horizontally: false,
    printings: [{ unique_id: 'yellow-printing', image_url: 'https://example.com/yellow.png', image_rotation_degrees: 0 }],
  },
  {
    unique_id: 'blue-card',
    name: 'Filter Blue',
    pitch: '3',
    types: ['Attack Action'],
    played_horizontally: false,
    printings: [{ unique_id: 'blue-printing', image_url: 'https://example.com/blue.png', image_rotation_degrees: 0 }],
  },
];

const previewCards = Array.from({ length: 12 }, (_, index) => ({
  unique_id: `preview-card-${index + 1}`,
  name: `Preview Card ${index + 1}`,
  pitch: '1',
  types: ['Attack Action'],
  played_horizontally: false,
  printings: [
    {
      unique_id: `preview-printing-${index + 1}`,
      image_url: `https://example.com/preview-${index + 1}.png`,
      image_rotation_degrees: 0,
    },
  ],
}));

function createJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

function createSetDownloadStatus(overrides = {}) {
  const state = overrides.state || 'idle';
  const total = overrides.total ?? 0;
  const completed = overrides.completed ?? (state === 'downloaded' ? total : 0);

  return {
    state,
    total,
    completed,
    downloaded: overrides.downloaded ?? (state === 'downloaded' && total > 0 && completed >= total),
    error: overrides.error || '',
  };
}

function createAppFetchMock({
  cardData = sampleCards,
  savedDeckSummaries = [],
  deckRecords = [],
  failCardsApi = false,
  saveDeckDelayMs = 0,
  setDownloadStatuses = {},
  setDownloadDelayMs = 0,
  setDownloadFinalStatuses = {},
} = {}) {
  let deckCounter = deckRecords.length + 1;
  let summaries = savedDeckSummaries.map((deck) => ({ ...deck }));
  const decksById = new Map(deckRecords.map((deck) => [deck.id, JSON.parse(JSON.stringify(deck))]));
  const currentSetStatuses = new Map(
    Object.entries(setDownloadStatuses).map(([setId, status]) => [setId, createSetDownloadStatus(status)])
  );

  return vi.fn(async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || 'GET').toUpperCase();

    if (url === 'http://127.0.0.1:3001/api/cards') {
      if (failCardsApi) {
        return createJsonResponse({ error: 'Cards API unavailable' }, 503);
      }

      return createJsonResponse(cardData);
    }

    if (url.includes('/cards.json') || url.includes('/sorcery-cards.json')) {
      return createJsonResponse(cardData);
    }

    if (url.includes('/api/sorcery/cards')) {
      return createJsonResponse([]);
    }

    if (url.includes('/api/upscale/registry')) {
      return createJsonResponse({});
    }

    if (url.startsWith('http://127.0.0.1:3001/api/decks') && !url.includes('/api/decks/')) {
      if (method === 'GET') {
        return createJsonResponse(summaries);
      }

      if (method === 'POST') {
        const payload = JSON.parse(init.body);
        const id = payload.id || `deck-${deckCounter++}`;
        const savedAt = '2026-03-08T10:00:00.000Z';
        const record = {
          id,
          name: payload.name,
          format: payload.format || '',
          savedAt,
          cards: payload.cards,
          previewCards: payload.previewCards || [],
        };
        const summary = {
          id,
          name: payload.name,
          format: payload.format || '',
          savedAt,
          cardCount: payload.cards.length,
          previewUrl: `http://127.0.0.1:3001/api/decks/${id}/preview?v=${encodeURIComponent(savedAt)}`,
        };

        decksById.set(id, record);
        summaries = [summary, ...summaries.filter((deck) => deck.id !== id && deck.name !== payload.name)];

        if (saveDeckDelayMs > 0) {
          await new Promise((resolve) => {
            setTimeout(resolve, saveDeckDelayMs);
          });
        }

        return createJsonResponse(summary);
      }
    }

    if (url === 'http://127.0.0.1:3001/api/card-sets/status' && method === 'POST') {
      const payload = JSON.parse(init.body || '{}');
      const setIds = Array.isArray(payload.setIds) ? payload.setIds : [];
      const sets = Object.fromEntries(
        setIds.map((setId) => [setId, currentSetStatuses.get(setId) || createSetDownloadStatus()])
      );

      return createJsonResponse({ sets });
    }

    const setDownloadMatch = url.match(/^http:\/\/127\.0\.0\.1:3001\/api\/card-sets\/([^/?]+)\/download$/);
    if (setDownloadMatch && method === 'POST') {
      const setId = decodeURIComponent(setDownloadMatch[1]);
      const currentStatus = currentSetStatuses.get(setId) || createSetDownloadStatus({ total: 1 });
      const nextStatus = createSetDownloadStatus({
        ...currentStatus,
        state: currentStatus.downloaded ? 'downloaded' : 'downloading',
      });

      currentSetStatuses.set(setId, nextStatus);

      if (!currentStatus.downloaded) {
        setTimeout(() => {
          const finalStatus = setDownloadFinalStatuses[setId];
          currentSetStatuses.set(
            setId,
            createSetDownloadStatus({
              ...nextStatus,
              ...(finalStatus || {
                state: 'downloaded',
                completed: nextStatus.total,
                downloaded: true,
              }),
            })
          );
        }, setDownloadDelayMs);
      }

      return createJsonResponse({ setId, ...nextStatus }, 202);
    }

    const previewMatch = url.match(/^http:\/\/127\.0\.0\.1:3001\/api\/decks\/([^/?]+)\/preview(?:\?.*)?$/);
    if (previewMatch) {
      return createJsonResponse({});
    }

    const deckMatch = url.match(/^http:\/\/127\.0\.0\.1:3001\/api\/decks\/([^/?]+)(?:\?.*)?$/);
    if (deckMatch) {
      const deckId = decodeURIComponent(deckMatch[1]);

      if (method === 'GET') {
        const record = decksById.get(deckId);
        return record ? createJsonResponse(record) : createJsonResponse({ error: 'Deck not found' }, 404);
      }

      if (method === 'DELETE') {
        decksById.delete(deckId);
        summaries = summaries.filter((deck) => deck.id !== deckId);
        return {
          ok: true,
          status: 204,
          json: async () => null,
        };
      }
    }

    throw new Error(`Unhandled fetch request: ${method} ${url}`);
  });
}

function installImageMock({ systemTheme = 'dark', imageLoadDelayMs = 0 } = {}) {
  class MockImage {
    set src(_value) {
      if (imageLoadDelayMs > 0) {
        setTimeout(() => {
          if (typeof this.onerror === 'function') {
            this.onerror(new Event('error'));
          }
        }, imageLoadDelayMs);
        return;
      }

      Promise.resolve().then(() => {
        if (typeof this.onerror === 'function') {
          this.onerror(new Event('error'));
        }
      });
    }
  }

  Object.defineProperty(window, 'Image', {
    configurable: true,
    value: MockImage,
  });
  Object.defineProperty(globalThis, 'Image', {
    configurable: true,
    value: MockImage,
  });

  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
  delete document.documentElement.dataset.themePreference;

  const storage = new Map();
  const localStorageMock = {
    getItem: vi.fn((key) => (storage.has(key) ? storage.get(key) : null)),
    setItem: vi.fn((key, value) => {
      storage.set(key, String(value));
    }),
    removeItem: vi.fn((key) => {
      storage.delete(key);
    }),
    clear: vi.fn(() => {
      storage.clear();
    }),
  };

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: localStorageMock,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: localStorageMock,
  });

  const mediaQuery = {
    media: '(prefers-color-scheme: dark)',
    matches: systemTheme === 'dark',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((type, listener) => {
      if (type === 'change') {
        mediaQuery._listeners.add(listener);
      }
    }),
    removeEventListener: vi.fn((type, listener) => {
      if (type === 'change') {
        mediaQuery._listeners.delete(listener);
      }
    }),
    dispatchEvent: vi.fn(),
    _listeners: new Set(),
  };

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query) => ({
      ...mediaQuery,
      media: query,
    })),
  });

  return {
    setSystemTheme(nextTheme) {
      mediaQuery.matches = nextTheme === 'dark';
      const event = { matches: mediaQuery.matches, media: mediaQuery.media };
      mediaQuery._listeners.forEach((listener) => listener(event));
    },
  };
}

function getLastSaveDeckPayload(fetchMock) {
  const saveDeckCalls = fetchMock.mock.calls.filter(
    ([url, init]) => url === 'http://127.0.0.1:3001/api/decks' && init?.method === 'POST'
  );

  const lastSaveDeckCall = saveDeckCalls.at(-1);

  if (!lastSaveDeckCall) {
    return null;
  }

  return JSON.parse(lastSaveDeckCall[1].body);
}

function mockElementRect(element, { left, top, width = 220, height = 320 }) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: left,
      y: top,
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      toJSON() {
        return this;
      },
    }),
  });
}

async function addCardsFromArchive(cardNames) {
  fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
  fireEvent.input(screen.getByRole('searchbox', { name: 'Archive search' }), {
    target: { value: 'Filter' },
  });

  for (const cardName of cardNames) {
    const archiveRow = await screen.findByLabelText(`Archive card ${cardName}`);
    fireEvent.click(within(archiveRow).getByRole('button', { name: 'Add' }));
  }

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
  });
}

describe('App shell', () => {
  it('removes the static legal footer markup from the host page template', () => {
    const hostPage = readFileSync(`${process.cwd()}/index.html`, 'utf8');

    expect(hostPage).not.toContain('<footer');
    expect(hostPage).not.toContain('Thanks to The Fab Cube');
    expect(hostPage).not.toContain('Legend Story Studios');
  });

  it('uses the metrics widget elevation tone for saved deck and archive list surfaces', () => {
    const appCss = readFileSync(`${process.cwd()}/src/app.css`, 'utf8');

    expect(appCss).toContain('background: color-mix(in oklab, var(--card) 74%, transparent);');
    expect(appCss).toContain('0 18px 44px rgba(0, 0, 0, 0.2)');
  });

  it('uses a two-pane workspace with left-side tabs that swap the input panel content', async () => {
    installImageMock();
    global.fetch = createAppFetchMock();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste decklist here...')).toBeInTheDocument();
    });

    const tabStrip = document.querySelector('.left-pane-tabs');
    expect(tabStrip).not.toBeNull();

    const deckTab = within(tabStrip).getByRole('button', { name: 'Import' });
    const archiveTab = within(tabStrip).getByRole('button', { name: 'Archive' });
    const savedDecksTab = within(tabStrip).getByRole('button', { name: 'Decks' });
    const metricsTab = within(tabStrip).getByRole('button', { name: 'Metrics' });

    expect(archiveTab).toBeInTheDocument();
    expect(savedDecksTab).toBeInTheDocument();
    expect(metricsTab).toBeInTheDocument();
    expect(metricsTab).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Tools' })).not.toBeInTheDocument();
    const leftFooter = document.querySelector('.left-pane-footer');
    expect(leftFooter).not.toBeNull();
    const importDeckButton = within(leftFooter).getByRole('button', { name: 'Import' });

    expect(importDeckButton).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Deck name' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /All/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Red/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Blue/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Yellow/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sideboard/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hero \+ Arena/ })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    const deckInput = screen.getByPlaceholderText('Paste decklist here...');

    expect(deckTab.querySelector('svg')).not.toBeNull();
    expect(archiveTab.querySelector('svg')).not.toBeNull();
    expect(savedDecksTab.querySelector('svg')).not.toBeNull();
    expect(metricsTab.querySelector('svg')).not.toBeNull();
    expect(within(deckTab).getByText('1')).toHaveClass('left-pane-tab-shortcut');
    expect(within(archiveTab).getByText('2')).toHaveClass('left-pane-tab-shortcut');
    expect(within(savedDecksTab).getByText('3')).toHaveClass('left-pane-tab-shortcut');
    expect(within(metricsTab).getByText('4')).toHaveClass('left-pane-tab-shortcut');
    expect(metricsTab).toHaveClass('cursor-not-allowed');
    expect(screen.queryByText('Input')).not.toBeInTheDocument();
    expect(deckInput).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    deckInput.focus();

    expect(deckInput).toBeInTheDocument();

    deckInput.blur();

    expect(screen.getByPlaceholderText('Paste decklist here...')).toBeInTheDocument();

    const leftToolbar = deckTab.closest('.left-pane-toolbar');
    const footerElement = importDeckButton.closest('.left-pane-footer');
    const leftHeader = deckTab.closest('.left-pane-header');
    const leftTabBar = deckTab.parentElement;
    const workspaceGrid = document.querySelector('.workspace-grid');
    const leftPaneShell = document.querySelector('.left-pane-shell');

    expect(leftHeader).not.toBeNull();
    expect(leftHeader).toHaveClass('justify-center');
    expect(leftHeader).not.toHaveClass('border-b');
    expect(leftToolbar).not.toBeNull();
    expect(leftToolbar).toHaveClass('w-full');
    expect(leftTabBar).not.toBeNull();
    expect(leftTabBar).toHaveClass('grid');
    expect(leftTabBar).toHaveAttribute('style', expect.stringContaining('repeat(4, minmax(0, 1fr))'));
    expect(footerElement).not.toBeNull();
    expect(leftToolbar).toHaveClass('justify-center');
    expect(footerElement).toHaveClass('justify-end');
    expect(footerElement).not.toHaveClass('border-t');
    expect(workspaceGrid).not.toBeNull();
    expect(workspaceGrid).toHaveClass('h-full');
    expect(workspaceGrid).toHaveClass('min-h-0');
    expect(workspaceGrid).toHaveClass('gap-4');
    expect(workspaceGrid).toHaveClass('xl:grid-cols-[minmax(400px,0.92fr)_minmax(0,1.08fr)]');
    expect(leftPaneShell).not.toBeNull();
    expect(leftPaneShell).toHaveClass('h-full');
    expect(leftPaneShell).toHaveClass('min-h-0');
    expect(deckTab).toHaveClass('w-full');
    expect(deckTab).toHaveClass('grid');
    expect(archiveTab).toHaveClass('w-full');
    expect(savedDecksTab).toHaveClass('w-full');
    expect(deckTab).not.toHaveClass('min-w-[184px]');
    expect(deckTab).not.toHaveClass('justify-between');
    expect(within(leftToolbar).getByRole('button', { name: 'Import' })).toBeInTheDocument();
    expect(within(footerElement).getByRole('button', { name: 'Import' })).toBeInTheDocument();
    expect(within(leftToolbar).queryByRole('button', { name: 'Export PDF' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeDisabled();
    expect(screen.queryByText('Export PDF')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Clear deck' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Upscale all' })).toBeDisabled();
    expect(screen.getByRole('menuitemcheckbox', { name: 'Print spacing off' })).toBeInTheDocument();

    fireEvent.click(archiveTab);

    const archiveSearch = screen.getByRole('searchbox', { name: 'Archive search' });
    const archiveSetFilter = screen.getByRole('button', { name: 'Archive set filter' });
    const archivePanel = archiveSearch.closest('.left-pane-panel-content');

    expect(archiveSearch).toBeInTheDocument();
    expect(archiveSetFilter).toBeInTheDocument();
    expect(archivePanel).toHaveClass('min-h-0');
    expect(archivePanel?.querySelector('.left-pane-scroll')).toHaveClass('overflow-y-auto');
    expect(screen.getByText(/Type 3\+ letters/)).toBeInTheDocument();
    const archiveFooter = document.querySelector('.left-pane-footer');
    expect(archiveFooter).toBeNull();

    fireEvent.click(savedDecksTab);

    const savedDeckSearch = screen.getByRole('searchbox', { name: 'Saved deck search' });
    const savedDeckControls = screen.getByTestId('saved-decks-controls');
    const savedDeckScrollRegion = savedDeckSearch.closest('.left-pane-panel-content')?.querySelector('.left-pane-scroll');

    expect(savedDeckSearch).toBeInTheDocument();
    expect(savedDeckSearch.closest('.left-pane-panel-content')).toHaveClass('min-h-0');
    expect(savedDeckControls).toContainElement(savedDeckSearch);
    expect(savedDeckScrollRegion).toHaveClass('overflow-y-auto');
    expect(screen.getByText('No saved decks yet')).toBeInTheDocument();
    expect(document.querySelector('.left-pane-footer')).toBeNull();

    fireEvent.click(metricsTab);

    expect(screen.queryByRole('heading', { name: 'Deck metrics' })).not.toBeInTheDocument();
    expect(screen.getByText('No saved decks yet')).toBeInTheDocument();

    fireEvent.click(deckTab);

    expect(screen.getByPlaceholderText('Paste decklist here...')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox', { name: 'Archive search' })).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox', { name: 'Saved deck search' })).not.toBeInTheDocument();
  });

  it('uses import format chips with auto selected by default instead of a dropdown', async () => {
    installImageMock();
    global.fetch = createAppFetchMock();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste decklist here...')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Deck format' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Classic Constructed' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Silver Age' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Classic Constructed' }));

    expect(screen.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Classic Constructed' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers system, light, and dark theme choices in the burger menu', async () => {
    const themeController = installImageMock({ systemTheme: 'dark' });
    global.fetch = createAppFetchMock();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste decklist here...')).toBeInTheDocument();
    });

    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.dataset.themePreference).toBe('system');

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

    const systemOption = screen.getByRole('menuitemradio', { name: 'System' });
    const lightOption = screen.getByRole('menuitemradio', { name: 'Light' });
    const darkOption = screen.getByRole('menuitemradio', { name: 'Dark' });

    expect(systemOption).toHaveAttribute('aria-checked', 'true');
    expect(lightOption).toHaveAttribute('aria-checked', 'false');
    expect(darkOption).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(lightOption);

    await waitFor(() => {
      expect(document.documentElement).not.toHaveClass('dark');
    });
    expect(window.localStorage.getItem('fab-builder-theme-preference')).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'System' }));

    await waitFor(() => {
      expect(document.documentElement).toHaveClass('dark');
    });
    expect(window.localStorage.getItem('fab-builder-theme-preference')).toBe('system');

    themeController.setSystemTheme('light');

    await waitFor(() => {
      expect(document.documentElement).not.toHaveClass('dark');
    });
    expect(document.documentElement.style.colorScheme).toBe('light');

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Dark' }));

    await waitFor(() => {
      expect(document.documentElement).toHaveClass('dark');
    });
    expect(window.localStorage.getItem('fab-builder-theme-preference')).toBe('dark');

    themeController.setSystemTheme('light');

    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('saves a named deck and reloads it from the searchable saved decks tab after remount', async () => {
    installImageMock();
    global.fetch = createAppFetchMock();

    const { unmount } = render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.input(screen.getByRole('searchbox', { name: 'Archive search' }), {
      target: { value: 'Command' },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
    });
    await waitFor(() => {
      expect(document.querySelector('.card-meta')).not.toBeNull();
    });
    expect(screen.getByText(/px/)).toBeInTheDocument();

    const printButton = screen.getByRole('button', { name: 'Export PDF' });
    const saveButton = screen.getByRole('button', { name: 'Save deck' });

    expect(saveButton).toBeEnabled();
    expect(printButton.parentElement).toContainElement(saveButton);

    fireEvent.click(saveButton);
    const saveDialog = await screen.findByRole('dialog', { name: 'Save deck' });
    fireEvent.input(within(saveDialog).getByRole('textbox', { name: 'Deck name' }), {
      target: { value: 'Bravo Deck' },
    });
    fireEvent.click(within(saveDialog).getByRole('button', { name: 'Save deck' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decks' }));

    await waitFor(() => {
      expect(screen.getByText('Bravo Deck')).toBeInTheDocument();
    });

    fireEvent.input(screen.getByRole('searchbox', { name: 'Saved deck search' }), {
      target: { value: 'zzz' },
    });

    await waitFor(() => {
      expect(screen.getByText('No saved decks match that search')).toBeInTheDocument();
    });

    fireEvent.input(screen.getByRole('searchbox', { name: 'Saved deck search' }), {
      target: { value: 'bravo' },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Load deck Bravo Deck' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear deck' }));

    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeDisabled();

    unmount();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Decks' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Decks' }));
    fireEvent.input(screen.getByRole('searchbox', { name: 'Saved deck search' }), {
      target: { value: 'bravo' },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Load deck Bravo Deck' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Load deck Bravo Deck' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
    });

    expect(screen.queryByRole('searchbox', { name: 'Saved deck search' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Deck name' })).not.toBeInTheDocument();
  });

  it('shows pitch and printing selection in archive results before adding a card', async () => {
    installImageMock();

    global.fetch = createAppFetchMock({
      cardData: [
        {
          unique_id: 'archive-card',
          name: 'Electrostatic Discharge',
          pitch: '1',
          types: ['Attack Action'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-1',
              image_url: 'https://example.com/archive-printing-1.png',
              set_id: 'ARC',
              image_rotation_degrees: 0,
            },
            {
              unique_id: 'archive-printing-2',
              image_url: 'https://example.com/archive-printing-2.png',
              set_id: 'MST',
              image_rotation_degrees: 0,
              art_variations: ['EA'],
            },
          ],
        },
      ],
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.input(screen.getByRole('searchbox', { name: 'Archive search' }), {
      target: { value: 'Electrostatic' },
    });

    const archiveRow = await screen.findByLabelText('Archive card Electrostatic Discharge');
    const printingTrigger = within(archiveRow).getByRole('button', { name: 'Printing 1' });
    const archiveActions = within(archiveRow).getByTestId('archive-actions');
    const pitchStrip = within(archiveRow).getByLabelText('Pitch strip Red');

    expect(within(archiveRow).queryByText('Red')).not.toBeInTheDocument();
    expect(pitchStrip).toHaveClass('bg-red-500');
    expect(pitchStrip.parentElement).toHaveClass('px-1');
    expect(pitchStrip.parentElement).toHaveClass('py-2');
    expect(pitchStrip).toHaveClass('w-2');
    expect(pitchStrip).toHaveClass('self-stretch');
    expect(pitchStrip).toHaveClass('rounded-full');
    expect(printingTrigger).toBeInTheDocument();
    expect(archiveActions).toHaveClass('items-center');

    fireEvent.click(printingTrigger);

    const printingMenu = await screen.findByRole('menu', { name: 'Printing options' });
    fireEvent.click(within(printingMenu).getByRole('menuitemradio', { name: /Printing 2/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
    });

    const importedCardsList = screen.getByLabelText('Imported cards list');

    expect(within(archiveRow).getByRole('button', { name: 'Printing 1' })).toBeInTheDocument();
    await waitFor(() => {
      expect(within(importedCardsList).getByRole('button', { name: 'Printing 2' })).toBeInTheDocument();
    });
  });

  it('filters archive results and printing choices by set', async () => {
    installImageMock();

    global.fetch = createAppFetchMock({
      cardData: [
        {
          unique_id: 'archive-card-a',
          name: 'Electrostatic Discharge',
          pitch: '1',
          types: ['Attack Action'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-arc',
              image_url: 'https://example.com/archive-printing-arc.png',
              set_id: 'ARC',
              image_rotation_degrees: 0,
            },
            {
              unique_id: 'archive-printing-mst',
              image_url: 'https://example.com/archive-printing-mst.png',
              set_id: 'MST',
              image_rotation_degrees: 0,
            },
          ],
        },
        {
          unique_id: 'archive-card-b',
          name: 'Static Shock',
          pitch: '3',
          types: ['Attack Action'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-wtr',
              image_url: 'https://example.com/archive-printing-wtr.png',
              set_id: 'WTR',
              image_rotation_degrees: 0,
            },
          ],
        },
      ],
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.input(screen.getByRole('searchbox', { name: 'Archive search' }), {
      target: { value: 'Static' },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Archive card Electrostatic Discharge')).toBeInTheDocument();
      expect(screen.getByLabelText('Archive card Static Shock')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive set filter' }));

    const setMenu = await screen.findByRole('menu', { name: 'Archive set filter' });
    expect(setMenu).toHaveClass('overflow-y-auto');
    expect(setMenu).toHaveClass('scrollbar-rail-less');
    expect(setMenu).toHaveClass('scrollbar-stable');
    fireEvent.click(within(setMenu).getByRole('menuitemradio', { name: 'Arcane Rising' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Archive card Electrostatic Discharge')).toBeInTheDocument();
      expect(screen.queryByLabelText('Archive card Static Shock')).toBeNull();
    });

    expect(within(screen.getByRole('button', { name: 'Archive set filter' })).getByText('Arcane Rising')).toBeInTheDocument();

    const archiveRow = screen.getByLabelText('Archive card Electrostatic Discharge');
    fireEvent.click(within(archiveRow).getByRole('button', { name: 'Printing 1' }));

    const printingMenu = await screen.findByRole('menu', { name: 'Printing options' });
    expect(within(printingMenu).getAllByRole('menuitemradio')).toHaveLength(1);
  });

  it('shows compact archive pitch tabs and filters matching archive results by color', async () => {
    installImageMock();

    global.fetch = createAppFetchMock({
      cardData: [
        {
          unique_id: 'archive-red',
          name: 'Pulse Wave',
          pitch: '1',
          types: ['Attack Action'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-red',
              image_url: 'https://example.com/archive-red.png',
              set_id: 'ARC',
              image_rotation_degrees: 0,
            },
          ],
        },
        {
          unique_id: 'archive-yellow',
          name: 'Pulse Step',
          pitch: '2',
          types: ['Attack Action'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-yellow',
              image_url: 'https://example.com/archive-yellow.png',
              set_id: 'ARC',
              image_rotation_degrees: 0,
            },
          ],
        },
        {
          unique_id: 'archive-blue',
          name: 'Pulse Barrier',
          pitch: '3',
          types: ['Defense Reaction'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-blue',
              image_url: 'https://example.com/archive-blue.png',
              set_id: 'WTR',
              image_rotation_degrees: 0,
            },
          ],
        },
      ],
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.input(screen.getByRole('searchbox', { name: 'Archive search' }), {
      target: { value: 'Pulse' },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Archive card Pulse Wave')).toBeInTheDocument();
      expect(screen.getByLabelText('Archive card Pulse Step')).toBeInTheDocument();
      expect(screen.getByLabelText('Archive card Pulse Barrier')).toBeInTheDocument();
    });

    const pitchTabs = screen.getByRole('tablist', { name: 'Archive pitch filter' });

    expect(within(pitchTabs).getByRole('tab', { name: 'All cards' })).toHaveAttribute('aria-selected', 'true');
    expect(within(pitchTabs).getByRole('tab', { name: 'Red cards' })).toBeInTheDocument();
    expect(within(pitchTabs).getByRole('tab', { name: 'Yellow cards' })).toBeInTheDocument();
    expect(within(pitchTabs).getByRole('tab', { name: 'Blue cards' })).toBeInTheDocument();

    fireEvent.click(within(pitchTabs).getByRole('tab', { name: 'Blue cards' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Archive card Pulse Barrier')).toBeInTheDocument();
      expect(screen.queryByLabelText('Archive card Pulse Wave')).toBeNull();
      expect(screen.queryByLabelText('Archive card Pulse Step')).toBeNull();
    });

    fireEvent.click(within(pitchTabs).getByRole('tab', { name: 'All cards' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Archive card Pulse Wave')).toBeInTheDocument();
      expect(screen.getByLabelText('Archive card Pulse Step')).toBeInTheDocument();
      expect(screen.getByLabelText('Archive card Pulse Barrier')).toBeInTheDocument();
    });
  });

  it('keeps the archive set filter beside the search input and groups the other archive filters below it', async () => {
    installImageMock();

    global.fetch = createAppFetchMock({
      cardData: [
        {
          unique_id: 'archive-ninja-red',
          name: 'Ninja Strike',
          pitch: '1',
          types: ['Ninja', 'Action', 'Attack'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-ninja-red',
              image_url: 'https://example.com/archive-ninja-red.png',
              set_id: 'ARC',
              rarity: 'C',
              image_rotation_degrees: 0,
            },
          ],
        },
        {
          unique_id: 'archive-guardian-red',
          name: 'Towering Guard',
          pitch: '1',
          types: ['Guardian', 'Defense Reaction'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-guardian-red',
              image_url: 'https://example.com/archive-guardian-red.png',
              set_id: 'ARC',
              rarity: 'R',
              image_rotation_degrees: 0,
            },
          ],
        },
        {
          unique_id: 'archive-ninja-blue',
          name: 'Blue Veil',
          pitch: '3',
          types: ['Ninja', 'Action', 'Attack'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-ninja-blue',
              image_url: 'https://example.com/archive-ninja-blue.png',
              set_id: 'WTR',
              rarity: 'C',
              image_rotation_degrees: 0,
            },
          ],
        },
        {
          unique_id: 'archive-warrior-yellow',
          name: 'Warrior Feint',
          pitch: '2',
          types: ['Warrior', 'Attack Reaction'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-warrior-yellow',
              image_url: 'https://example.com/archive-warrior-yellow.png',
              set_id: 'ARC',
              rarity: 'M',
              image_rotation_degrees: 0,
            },
          ],
        },
      ],
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    const searchRow = screen.getByTestId('archive-search-row');
    const filterControls = screen.getByTestId('archive-filter-controls');
    const archiveSearch = within(searchRow).getByRole('searchbox', { name: 'Archive search' });
    const setFilter = within(searchRow).getByRole('button', { name: 'Archive set filter' });
    const typeFilter = within(filterControls).getByRole('button', { name: 'Archive card type filter' });
    const rarityFilter = within(filterControls).getByRole('button', { name: 'Archive rarity filter' });
    const classFilter = within(filterControls).getByRole('button', { name: 'Archive class filter' });
    const pitchTabs = within(filterControls).getByRole('tablist', { name: 'Archive pitch filter' });

    expect(archiveSearch).toBeInTheDocument();
    expect(setFilter).toBeInTheDocument();
    expect(typeFilter).toBeInTheDocument();
    expect(rarityFilter).toBeInTheDocument();
    expect(classFilter).toBeInTheDocument();
    expect(pitchTabs).toBeInTheDocument();
    expect(within(filterControls).queryByRole('button', { name: 'Archive set filter' })).toBeNull();
    expect(screen.getByText(/Type 3\+ letters/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive set filter' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Archive card type filter' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Archive rarity filter' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Archive class filter' })).toBeEnabled();
    });

    fireEvent.click(typeFilter);
    fireEvent.click(within(await screen.findByRole('menu', { name: 'Archive card type filter' })).getByRole('menuitemradio', { name: 'Attack Action' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Archive card Ninja Strike')).toBeInTheDocument();
      expect(screen.getByLabelText('Archive card Blue Veil')).toBeInTheDocument();
      expect(screen.queryByLabelText('Archive card Towering Guard')).toBeNull();
      expect(screen.queryByLabelText('Archive card Warrior Feint')).toBeNull();
    });
    expect(screen.queryByText(/Type 3\+ letters/)).toBeNull();

    fireEvent.click(setFilter);
    fireEvent.click(within(await screen.findByRole('menu', { name: 'Archive set filter' })).getByRole('menuitemradio', { name: 'Welcome to Rathe' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Archive card Blue Veil')).toBeInTheDocument();
      expect(screen.queryByLabelText('Archive card Ninja Strike')).toBeNull();
    });

    fireEvent.click(within(pitchTabs).getByRole('tab', { name: 'Blue cards' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Archive card Blue Veil')).toBeInTheDocument();
      expect(screen.queryByLabelText('Archive card Ninja Strike')).toBeNull();
    });

    fireEvent.click(rarityFilter);
    fireEvent.click(within(await screen.findByRole('menu', { name: 'Archive rarity filter' })).getByRole('menuitemradio', { name: 'Common' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Archive card Blue Veil')).toBeInTheDocument();
    });

    fireEvent.click(classFilter);
    fireEvent.click(within(await screen.findByRole('menu', { name: 'Archive class filter' })).getByRole('menuitemradio', { name: 'Ninja' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Archive card Blue Veil')).toBeInTheDocument();
      expect(screen.queryByLabelText('Archive card Towering Guard')).toBeNull();
      expect(screen.queryByLabelText('Archive card Warrior Feint')).toBeNull();
    });
  });

  it('limits archive printing choices to printings that match the active rarity filter for the filtered card rows', async () => {
    installImageMock();

    global.fetch = createAppFetchMock({
      cardData: [
        {
          unique_id: 'archive-guardian-weapon-mixed',
          name: 'Stonewall Hammer',
          pitch: '',
          types: ['Guardian', 'Weapon'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-stonewall-common',
              image_url: 'https://example.com/archive-printing-stonewall-common.png',
              set_id: 'ARC',
              rarity: 'C',
              image_rotation_degrees: 0,
            },
            {
              unique_id: 'archive-printing-stonewall-rare',
              image_url: 'https://example.com/archive-printing-stonewall-rare.png',
              set_id: 'DYN',
              rarity: 'R',
              image_rotation_degrees: 0,
            },
          ],
        },
        {
          unique_id: 'archive-guardian-weapon-common',
          name: 'Rustbound Mace',
          pitch: '',
          types: ['Guardian', 'Weapon'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-rustbound-common',
              image_url: 'https://example.com/archive-printing-rustbound-common.png',
              set_id: 'ARC',
              rarity: 'C',
              image_rotation_degrees: 0,
            },
          ],
        },
        {
          unique_id: 'archive-guardian-weapon-rare',
          name: 'Valor Maul',
          pitch: '',
          types: ['Guardian', 'Weapon'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-valor-rare',
              image_url: 'https://example.com/archive-printing-valor-rare.png',
              set_id: 'ARC',
              rarity: 'R',
              image_rotation_degrees: 0,
            },
          ],
        },
        {
          unique_id: 'archive-warrior-weapon-rare',
          name: 'Dueling Sabre',
          pitch: '',
          types: ['Warrior', 'Weapon'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-dueling-rare',
              image_url: 'https://example.com/archive-printing-dueling-rare.png',
              set_id: 'ARC',
              rarity: 'R',
              image_rotation_degrees: 0,
            },
          ],
        },
      ],
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive card type filter' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Archive rarity filter' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Archive class filter' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive card type filter' }));
    fireEvent.click(within(await screen.findByRole('menu', { name: 'Archive card type filter' })).getByRole('menuitemradio', { name: 'Weapon' }));

    fireEvent.click(screen.getByRole('button', { name: 'Archive rarity filter' }));
    fireEvent.click(within(await screen.findByRole('menu', { name: 'Archive rarity filter' })).getByRole('menuitemradio', { name: 'Rare' }));

    fireEvent.click(screen.getByRole('button', { name: 'Archive class filter' }));
    fireEvent.click(within(await screen.findByRole('menu', { name: 'Archive class filter' })).getByRole('menuitemradio', { name: 'Guardian' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Archive card Stonewall Hammer')).toBeInTheDocument();
      expect(screen.getByLabelText('Archive card Valor Maul')).toBeInTheDocument();
      expect(screen.queryByLabelText('Archive card Rustbound Mace')).toBeNull();
      expect(screen.queryByLabelText('Archive card Dueling Sabre')).toBeNull();
    });

    const stonewallRow = screen.getByLabelText('Archive card Stonewall Hammer');
    const printingButton = within(stonewallRow).getByRole('button', { name: /Printing \d+/ });

    fireEvent.click(printingButton);

    const printingMenu = await screen.findByRole('menu', { name: 'Printing options' });

    expect(within(printingMenu).getAllByRole('menuitemradio')).toHaveLength(1);
  });

  it('shows all cards from a selected archive set without requiring a 3-letter search query', async () => {
    installImageMock();

    global.fetch = createAppFetchMock({
      cardData: [
        {
          unique_id: 'archive-card-a',
          name: 'Arcane Shockwave',
          pitch: '1',
          types: ['Attack Action'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-arc',
              image_url: 'https://example.com/archive-printing-arc.png',
              set_id: 'ARC',
              image_rotation_degrees: 0,
            },
          ],
        },
        {
          unique_id: 'archive-card-b',
          name: 'WTR Card',
          pitch: '3',
          types: ['Attack Action'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-wtr',
              image_url: 'https://example.com/archive-printing-wtr.png',
              set_id: 'WTR',
              image_rotation_degrees: 0,
            },
          ],
        },
      ],
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive set filter' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive set filter' }));

    const setMenu = await screen.findByRole('menu', { name: 'Archive set filter' });
    fireEvent.click(within(setMenu).getByRole('menuitemradio', { name: 'Arcane Rising' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Archive card Arcane Shockwave')).toBeInTheDocument();
      expect(screen.queryByLabelText('Archive card WTR Card')).toBeNull();
    });

    expect(screen.queryByText(/Type 3\+ letters/)).toBeNull();
  });

  it('downloads an archive set asynchronously and marks it complete in the set dropdown', async () => {
    installImageMock();

    global.fetch = createAppFetchMock({
      cardData: [
        {
          unique_id: 'archive-card-a',
          name: 'Arcane Shockwave',
          pitch: '1',
          types: ['Attack Action'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-arc',
              image_url: 'https://example.com/archive-printing-arc.png',
              set_id: 'ARC',
              image_rotation_degrees: 0,
            },
          ],
        },
      ],
      setDownloadStatuses: {
        ARC: { state: 'idle', total: 1, completed: 0, downloaded: false },
      },
      setDownloadDelayMs: 20,
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive set filter' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive set filter' }));

    const setMenu = await screen.findByRole('menu', { name: 'Archive set filter' });
    const downloadButton = within(setMenu).getByRole('button', { name: 'Download Arcane Rising' });

    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(within(screen.getByRole('menu', { name: 'Archive set filter' })).getByRole('button', { name: 'Arcane Rising downloaded' })).toBeInTheDocument();
    });
  });

  it('shows circular progress for an archive set download in the set dropdown', async () => {
    installImageMock();

    global.fetch = createAppFetchMock({
      cardData: [
        {
          unique_id: 'archive-card-a',
          name: 'Arcane Shockwave',
          pitch: '1',
          types: ['Attack Action'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-arc',
              image_url: 'https://example.com/archive-printing-arc.png',
              set_id: 'ARC',
              image_rotation_degrees: 0,
            },
          ],
        },
      ],
      setDownloadStatuses: {
        ARC: { state: 'downloading', total: 4, completed: 2, downloaded: false },
      },
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive set filter' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive set filter' }));

    const setMenu = await screen.findByRole('menu', { name: 'Archive set filter' });
    const progress = within(setMenu).getByRole('progressbar', { name: 'Download progress for Arcane Rising' });

    expect(progress).toHaveAttribute('aria-valuenow', '50');
    expect(within(setMenu).getByRole('button', { name: 'Downloading Arcane Rising (2 of 4)' })).toBeInTheDocument();
  });

  it('shows Sonner toasts when an archive set download starts and finishes', async () => {
    installImageMock();

    global.fetch = createAppFetchMock({
      cardData: [
        {
          unique_id: 'archive-card-a',
          name: 'Arcane Shockwave',
          pitch: '1',
          types: ['Attack Action'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-arc',
              image_url: 'https://example.com/archive-printing-arc.png',
              set_id: 'ARC',
              image_rotation_degrees: 0,
            },
          ],
        },
      ],
      setDownloadStatuses: {
        ARC: { state: 'idle', total: 1, completed: 0, downloaded: false },
      },
      setDownloadDelayMs: 20,
    });

    render(<App />);

    expect(screen.getByTestId('sonner-toaster')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive set filter' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive set filter' }));

    const setMenu = await screen.findByRole('menu', { name: 'Archive set filter' });
    fireEvent.click(within(setMenu).getByRole('button', { name: 'Download Arcane Rising' }));

    expect(sonnerToastMocks.loading).toHaveBeenCalledWith(
      'Starting set download',
      expect.objectContaining({
        description: 'Arcane Rising is downloading in the background.',
      })
    );

    await waitFor(() => {
      expect(sonnerToastMocks.success).toHaveBeenCalledWith(
        'Set download complete',
        expect.objectContaining({
          description: 'Arcane Rising is now available on this machine.',
        })
      );
    });
  });

  it('shows a Sonner error toast when an archive set download fails', async () => {
    installImageMock();
    globalThis.alert = vi.fn();

    global.fetch = createAppFetchMock({
      cardData: [
        {
          unique_id: 'archive-card-a',
          name: 'High Seas Card',
          pitch: '1',
          types: ['Attack Action'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-hnt',
              image_url: 'https://example.com/archive-printing-hnt.png',
              set_id: 'HNT',
              image_rotation_degrees: 0,
            },
          ],
        },
      ],
      setDownloadStatuses: {
        HNT: { state: 'idle', total: 3, completed: 0, downloaded: false },
      },
      setDownloadDelayMs: 20,
      setDownloadFinalStatuses: {
        HNT: { state: 'error', completed: 1, downloaded: false, error: 'Failed to download card set HNT' },
      },
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive set filter' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive set filter' }));

    const setMenu = await screen.findByRole('menu', { name: 'Archive set filter' });
    fireEvent.click(within(setMenu).getByRole('button', { name: 'Download The Hunted' }));

    await waitFor(() => {
      expect(sonnerToastMocks.error).toHaveBeenCalledWith(
        'Set download failed',
        expect.objectContaining({
          description: 'Failed to download card set HNT',
        })
      );
    });

    expect(globalThis.alert).not.toHaveBeenCalled();
  });

  it('shows archive set download buttons even when card loading falls back to the bundled asset', async () => {
    installImageMock();

    global.fetch = createAppFetchMock({
      cardData: [
        {
          unique_id: 'archive-card-a',
          name: 'Arcane Shockwave',
          pitch: '1',
          types: ['Attack Action'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-arc',
              image_url: 'https://example.com/archive-printing-arc.png',
              set_id: 'ARC',
              image_rotation_degrees: 0,
            },
          ],
        },
      ],
      failCardsApi: true,
      setDownloadStatuses: {
        ARC: { state: 'idle', total: 1, completed: 0, downloaded: false },
      },
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive set filter' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive set filter' }));

    const setMenu = await screen.findByRole('menu', { name: 'Archive set filter' });

    expect(within(setMenu).getByRole('button', { name: 'Download Arcane Rising' })).toBeInTheDocument();
  });

  it('supports searching sets inside the archive set dropdown', async () => {
    installImageMock();

    global.fetch = createAppFetchMock({
      cardData: [
        {
          unique_id: 'archive-card-a',
          name: 'Arcane Shockwave',
          pitch: '1',
          types: ['Attack Action'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-arc',
              image_url: 'https://example.com/archive-printing-arc.png',
              set_id: 'ARC',
              image_rotation_degrees: 0,
            },
            {
              unique_id: 'archive-printing-mst',
              image_url: 'https://example.com/archive-printing-mst.png',
              set_id: 'MST',
              image_rotation_degrees: 0,
            },
          ],
        },
        {
          unique_id: 'archive-card-b',
          name: 'WTR Card',
          pitch: '3',
          types: ['Attack Action'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'archive-printing-wtr',
              image_url: 'https://example.com/archive-printing-wtr.png',
              set_id: 'WTR',
              image_rotation_degrees: 0,
            },
          ],
        },
      ],
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive set filter' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive set filter' }));

    const setMenu = await screen.findByRole('menu', { name: 'Archive set filter' });
    const setSearch = within(setMenu).getByRole('searchbox', { name: 'Search archive sets' });

    fireEvent.input(setSearch, { target: { value: 'Arcane' } });

    expect(within(setMenu).getByRole('menuitemradio', { name: 'Arcane Rising' })).toBeInTheDocument();
    expect(within(setMenu).queryByRole('menuitemradio', { name: 'Welcome to Rathe' })).toBeNull();
    expect(within(setMenu).queryByRole('menuitemradio', { name: 'Part the Mistveil' })).toBeNull();
  });

  it('opens a save dialog instead of keeping a persistent deck-name input in the sidebar', async () => {
    installImageMock();
    const fetchMock = createAppFetchMock();
    global.fetch = fetchMock;

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    });

    expect(screen.queryByRole('textbox', { name: 'Deck name' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.input(screen.getByRole('searchbox', { name: 'Archive search' }), {
      target: { value: 'Command' },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save deck' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save deck' }));

    const saveDialog = await screen.findByRole('dialog', { name: 'Save deck' });
    const deckNameInput = within(saveDialog).getByRole('textbox', { name: 'Deck name' });

    expect(deckNameInput).toHaveValue('');
    expect(within(saveDialog).getByRole('button', { name: 'Save deck' })).toBeInTheDocument();

    fireEvent.input(deckNameInput, { target: { value: 'Modal Deck' } });
    fireEvent.click(within(saveDialog).getByRole('button', { name: 'Save deck' }));

    await waitFor(() => {
      expect(getLastSaveDeckPayload(fetchMock)).toMatchObject({ name: 'Modal Deck' });
    });
  });

  it('shows a loading state on the save button while the save deck modal is submitting', async () => {
    installImageMock();
    const fetchMock = createAppFetchMock({ saveDeckDelayMs: 120 });
    global.fetch = fetchMock;

    const appRef = createRef();
    render(<App ref={appRef} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.input(screen.getByRole('searchbox', { name: 'Archive search' }), {
      target: { value: 'Command' },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save deck' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save deck' }));

    const saveDialog = await screen.findByRole('dialog', { name: 'Save deck' });
    fireEvent.input(within(saveDialog).getByRole('textbox', { name: 'Deck name' }), {
      target: { value: 'Spinner Deck' },
    });

    fireEvent.click(within(saveDialog).getByRole('button', { name: 'Save deck' }));

    expect(within(saveDialog).getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(screen.getByRole('dialog', { name: 'Save deck' })).toBeInTheDocument();

    await waitFor(() => {
      expect(getLastSaveDeckPayload(fetchMock)).toMatchObject({ name: 'Spinner Deck' });
    });

    await waitFor(() => {
      expect(appRef.current.state.isSaveDialogOpen).toBe(false);
      expect(document.body.querySelector('[role="dialog"][aria-label="Save deck"]')).toBeNull();
    });
  });

  it('prefills the save dialog for an existing deck and lets the user save a copy', async () => {
    installImageMock();
    const fetchMock = createAppFetchMock({
      savedDeckSummaries: [
        {
          id: 'deck-bravo',
          name: 'Bravo Deck',
          savedAt: '2026-03-08T10:00:00.000Z',
          cardCount: 1,
          previewUrl: 'http://127.0.0.1:3001/api/decks/deck-bravo/preview?v=2026-03-08T10%3A00%3A00.000Z',
        },
      ],
      deckRecords: [
        {
          id: 'deck-bravo',
          name: 'Bravo Deck',
          savedAt: '2026-03-08T10:00:00.000Z',
          cards: [{ cardId: 'card-1', cardName: 'Command and Conquer', printingId: 'printing-1' }],
          previewCards: [{ name: 'Command and Conquer', imageUrl: 'https://example.com/card-1.png' }],
        },
      ],
    });
    global.fetch = fetchMock;

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Decks' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Decks' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load deck Bravo Deck' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save deck' }));

    const saveDialog = await screen.findByRole('dialog', { name: 'Save deck' });
    const deckNameInput = within(saveDialog).getByRole('textbox', { name: 'Deck name' });

    expect(deckNameInput).toHaveValue('Bravo Deck');
    expect(within(saveDialog).getByRole('button', { name: 'Update deck' })).toBeInTheDocument();
    expect(within(saveDialog).getByRole('button', { name: 'Save as copy' })).toBeInTheDocument();

    fireEvent.input(deckNameInput, { target: { value: 'Bravo Deck Copy' } });
    fireEvent.click(within(saveDialog).getByRole('button', { name: 'Save as copy' }));

    await waitFor(() => {
      expect(getLastSaveDeckPayload(fetchMock)).toMatchObject({ name: 'Bravo Deck Copy' });
    });

    expect(getLastSaveDeckPayload(fetchMock)).not.toHaveProperty('id');
  });

  it('auto-saves the open named deck before loading another saved deck, but requires a name for unnamed decks', async () => {
    installImageMock();
    const fetchMock = createAppFetchMock({
      cardData: [
        {
          unique_id: 'card-1',
          name: 'Command and Conquer',
          pitch: '1',
          types: ['Attack Action'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'printing-1',
              image_url: 'https://example.com/card-1.png',
              image_rotation_degrees: 0,
            },
          ],
        },
        {
          unique_id: 'card-2',
          name: 'Sink Below',
          pitch: '3',
          types: ['Defense Reaction'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'printing-2',
              image_url: 'https://example.com/card-2.png',
              image_rotation_degrees: 0,
            },
          ],
        },
        {
          unique_id: 'card-3',
          name: 'Pummel',
          pitch: '1',
          types: ['Attack Reaction'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'printing-3',
              image_url: 'https://example.com/card-3.png',
              image_rotation_degrees: 0,
            },
          ],
        },
      ],
      savedDeckSummaries: [
        {
          id: 'deck-bravo',
          name: 'Bravo Deck',
          savedAt: '2026-03-08T10:00:00.000Z',
          cardCount: 1,
          previewUrl: 'http://127.0.0.1:3001/api/decks/deck-bravo/preview?v=2026-03-08T10%3A00%3A00.000Z',
        },
        {
          id: 'deck-pummel',
          name: 'Pummel Deck',
          savedAt: '2026-03-08T11:00:00.000Z',
          cardCount: 1,
          previewUrl: 'http://127.0.0.1:3001/api/decks/deck-pummel/preview?v=2026-03-08T11%3A00%3A00.000Z',
        },
      ],
      deckRecords: [
        {
          id: 'deck-bravo',
          name: 'Bravo Deck',
          savedAt: '2026-03-08T10:00:00.000Z',
          cards: [{ cardId: 'card-1', cardName: 'Command and Conquer', printingId: 'printing-1' }],
          previewCards: [{ name: 'Command and Conquer', imageUrl: 'https://example.com/card-1.png' }],
        },
        {
          id: 'deck-pummel',
          name: 'Pummel Deck',
          savedAt: '2026-03-08T11:00:00.000Z',
          cards: [{ cardId: 'card-3', cardName: 'Pummel', printingId: 'printing-3' }],
          previewCards: [{ name: 'Pummel', imageUrl: 'https://example.com/card-3.png' }],
        },
      ],
    });
    global.fetch = fetchMock;

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Decks' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Decks' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load deck Bravo Deck' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.input(screen.getByRole('searchbox', { name: 'Archive search' }), {
      target: { value: 'Sink' },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    fireEvent.click(screen.getByRole('button', { name: 'Decks' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load deck Pummel Deck' }));

    const autoSaveCall = fetchMock.mock.calls.find(
      ([url, init]) => url === 'http://127.0.0.1:3001/api/decks' && init?.method === 'POST' && JSON.parse(init.body).id === 'deck-bravo'
    );

    expect(autoSaveCall).toBeTruthy();
    expect(JSON.parse(autoSaveCall[1].body)).toMatchObject({
      id: 'deck-bravo',
      name: 'Bravo Deck',
      cards: [
        { cardId: 'card-1', cardName: 'Command and Conquer', printingId: 'printing-1' },
        { cardId: 'card-2', cardName: 'Sink Below', printingId: 'printing-2' },
      ],
    });

    await waitFor(() => {
      const deckScrollRegion = screen.getByLabelText('Imported cards list');
      expect(within(deckScrollRegion).getByAltText('Pummel')).toBeInTheDocument();
      expect(within(deckScrollRegion).queryByAltText('Command and Conquer')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByAltText('Sink Below')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear deck' }));

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.input(screen.getByRole('searchbox', { name: 'Archive search' }), {
      target: { value: 'Command' },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    fireEvent.click(screen.getByRole('button', { name: 'Decks' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load deck Bravo Deck' }));

    const saveDialog = await screen.findByRole('dialog', { name: 'Save deck' });

    expect(within(saveDialog).getByRole('textbox', { name: 'Deck name' })).toBeInTheDocument();

    const deckScrollRegion = screen.getByLabelText('Imported cards list');
    expect(within(deckScrollRegion).getByAltText('Command and Conquer')).toBeInTheDocument();
    expect(within(deckScrollRegion).queryByAltText('Pummel')).not.toBeInTheDocument();
  });

  it('closes the open saved deck from the toolbar and keeps its latest changes', async () => {
    installImageMock();
    const fetchMock = createAppFetchMock({
      cardData: [
        {
          unique_id: 'card-1',
          name: 'Command and Conquer',
          pitch: '1',
          types: ['Attack Action'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'printing-1',
              image_url: 'https://example.com/card-1.png',
              image_rotation_degrees: 0,
            },
          ],
        },
        {
          unique_id: 'card-2',
          name: 'Sink Below',
          pitch: '3',
          types: ['Defense Reaction'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'printing-2',
              image_url: 'https://example.com/card-2.png',
              image_rotation_degrees: 0,
            },
          ],
        },
      ],
      savedDeckSummaries: [
        {
          id: 'deck-bravo',
          name: 'Bravo Deck',
          savedAt: '2026-03-08T10:00:00.000Z',
          cardCount: 1,
          previewUrl: 'http://127.0.0.1:3001/api/decks/deck-bravo/preview?v=2026-03-08T10%3A00%3A00.000Z',
        },
      ],
      deckRecords: [
        {
          id: 'deck-bravo',
          name: 'Bravo Deck',
          savedAt: '2026-03-08T10:00:00.000Z',
          cards: [{ cardId: 'card-1', cardName: 'Command and Conquer', printingId: 'printing-1' }],
          previewCards: [{ name: 'Command and Conquer', imageUrl: 'https://example.com/card-1.png' }],
        },
      ],
    });
    global.fetch = fetchMock;

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Decks' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Decks' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load deck Bravo Deck' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.input(screen.getByRole('searchbox', { name: 'Archive search' }), {
      target: { value: 'Sink' },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      const deckScrollRegion = screen.getByLabelText('Imported cards list');
      expect(within(deckScrollRegion).getByAltText('Command and Conquer')).toBeInTheDocument();
      expect(within(deckScrollRegion).getByAltText('Sink Below')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close deck' }));

    const autoSaveCall = fetchMock.mock.calls.find(
      ([url, init]) => url === 'http://127.0.0.1:3001/api/decks' && init?.method === 'POST' && JSON.parse(init.body).id === 'deck-bravo'
    );

    expect(autoSaveCall).toBeTruthy();
    expect(JSON.parse(autoSaveCall[1].body)).toMatchObject({
      id: 'deck-bravo',
      name: 'Bravo Deck',
      cards: [
        { cardId: 'card-1', cardName: 'Command and Conquer', printingId: 'printing-1' },
        { cardId: 'card-2', cardName: 'Sink Below', printingId: 'printing-2' },
      ],
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Export PDF' })).toBeDisabled();
    });

    const deckScrollRegion = screen.getByLabelText('Imported cards list');
    expect(within(deckScrollRegion).queryByAltText('Command and Conquer')).not.toBeInTheDocument();
    expect(within(deckScrollRegion).queryByAltText('Sink Below')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).not.toBeInTheDocument();
  });

  it('prompts before closing an unnamed deck and lets the user discard the grid', async () => {
    installImageMock();
    const fetchMock = createAppFetchMock();
    global.fetch = fetchMock;

    const appRef = createRef();
    render(<App ref={appRef} />);

    await waitFor(() => {
      expect(appRef.current).toBeTruthy();
      expect(appRef.current.state.cards).not.toBeNull();
    });

    const commandCard = appRef.current.state.cards.find((card) => card.name === 'Command and Conquer');
    expect(commandCard).toBeTruthy();

    appRef.current.setState({
      chosenCards: [{ card: commandCard, printing: commandCard.printings[0], isSideboard: false }],
      currentDeckName: '',
      currentSavedDeckId: '',
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close deck' }));

    const unsavedDialog = await screen.findByRole('dialog', { name: 'Unsaved changes' });
    expect(within(unsavedDialog).getByRole('button', { name: 'Save as deck' })).toBeInTheDocument();
    expect(within(unsavedDialog).getByRole('button', { name: 'Discard changes' })).toBeInTheDocument();

    fireEvent.click(within(unsavedDialog).getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Export PDF' })).toBeDisabled();
    });

    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => url === 'http://127.0.0.1:3001/api/decks' && init?.method === 'POST'
      )
    ).toBe(false);
  });

  it('lets the user save an unnamed deck before closing it from the toolbar', async () => {
    installImageMock();
    const fetchMock = createAppFetchMock();
    global.fetch = fetchMock;

    const appRef = createRef();
    render(<App ref={appRef} />);

    await waitFor(() => {
      expect(appRef.current).toBeTruthy();
      expect(appRef.current.state.cards).not.toBeNull();
    });

    const commandCard = appRef.current.state.cards.find((card) => card.name === 'Command and Conquer');
    expect(commandCard).toBeTruthy();

    appRef.current.setState({
      chosenCards: [{ card: commandCard, printing: commandCard.printings[0], isSideboard: false }],
      currentDeckName: '',
      currentSavedDeckId: '',
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close deck' }));

    const unsavedDialog = await screen.findByRole('dialog', { name: 'Unsaved changes' });
    fireEvent.click(within(unsavedDialog).getByRole('button', { name: 'Save as deck' }));

    const saveDialog = await screen.findByRole('dialog', { name: 'Save deck' });
    fireEvent.input(within(saveDialog).getByRole('textbox', { name: 'Deck name' }), {
      target: { value: 'Toolbar Close Deck' },
    });
    fireEvent.click(within(saveDialog).getByRole('button', { name: 'Save and close' }));

    await waitFor(() => {
      expect(getLastSaveDeckPayload(fetchMock)).toMatchObject({
        name: 'Toolbar Close Deck',
        cards: [{ cardId: 'card-1', cardName: 'Command and Conquer', printingId: 'printing-1' }],
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Export PDF' })).toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Decks' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Load deck Toolbar Close Deck' })).toBeInTheDocument();
    });
  });

  it('uses the active printing image when saving preview cards for a deck', async () => {
    installImageMock();

    const fetchMock = createAppFetchMock({
      cardData: [
        {
          unique_id: 'card-hires',
          name: 'High Resolution Card',
          pitch: '1',
          types: ['Attack Action'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'printing-hires',
              image_url: 'https://example.com/high-res-card.png',
              _source_image_url: 'https://example.com/low-res-card.png',
              image_rotation_degrees: 0,
            },
          ],
        },
      ],
    });

    global.fetch = fetchMock;

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste decklist here...')).toBeInTheDocument();
    });
    fireEvent.input(screen.getByPlaceholderText('Paste decklist here...'), {
      target: { value: '1x High Resolution Card' },
    });

    const getDeckImportButton = () => screen.getAllByRole('button', { name: 'Import' }).at(-1);
    expect(getDeckImportButton()).toBeTruthy();

    await waitFor(() => {
      expect(getDeckImportButton()).toBeEnabled();
    });

    fireEvent.click(getDeckImportButton());

    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: 'Save deck' })).toBeEnabled();
      },
      { timeout: 3000 }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save deck' }));
    const saveDialog = await screen.findByRole('dialog', { name: 'Save deck' });
    fireEvent.input(within(saveDialog).getByRole('textbox', { name: 'Deck name' }), {
      target: { value: 'High Res Deck' },
    });
    fireEvent.click(within(saveDialog).getByRole('button', { name: 'Save deck' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:3001/api/decks',
        expect.objectContaining({ method: 'POST' })
      );
    });

    const saveDeckCall = fetchMock.mock.calls.find(
      ([url, init]) => url === 'http://127.0.0.1:3001/api/decks' && init?.method === 'POST'
    );

    expect(saveDeckCall).toBeTruthy();

    const payload = JSON.parse(saveDeckCall[1].body);

    expect(payload.previewCards).toEqual([
      {
        name: 'High Resolution Card',
        imageUrl: 'https://example.com/high-res-card.png',
      },
    ]);
  });

  it('uses the persisted upscaled image when saving preview cards for an upscaled deck entry', async () => {
    installImageMock();
    upscaylMocks.upscaleImageUrl.mockClear();
    upscaylMocks.blobToObjectUrl.mockClear();
    upscaylMocks.blobToDataUrl.mockClear();

    const fetchMock = createAppFetchMock();
    global.fetch = fetchMock;

    const appRef = createRef();
    render(<App ref={appRef} />);

    await waitFor(() => {
      expect(appRef.current).toBeTruthy();
    });

    await waitFor(() => {
      expect(appRef.current.state.cards).not.toBeNull();
    });

    const commandCard = appRef.current.state.cards.find((card) => card.name === 'Command and Conquer');
    expect(commandCard).toBeTruthy();

    const upscaleResult = await appRef.current.createUpscaledPrinting(commandCard.printings[0]);
    expect(upscaleResult).toBeTruthy();

    appRef.current.setState({
      chosenCards: [
        {
          card: commandCard,
          printing: upscaleResult.upscaledPrinting,
          isSideboard: false,
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save deck' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save deck' }));
    const saveDialog = await screen.findByRole('dialog', { name: 'Save deck' });
    fireEvent.input(within(saveDialog).getByRole('textbox', { name: 'Deck name' }), {
      target: { value: 'Upscaled Deck' },
    });
    fireEvent.click(within(saveDialog).getByRole('button', { name: 'Save deck' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:3001/api/decks',
        expect.objectContaining({ method: 'POST' })
      );
    });

    const saveDeckCall = fetchMock.mock.calls.find(
      ([url, init]) => url === 'http://127.0.0.1:3001/api/decks' && init?.method === 'POST'
    );

    expect(saveDeckCall).toBeTruthy();

    const payload = JSON.parse(saveDeckCall[1].body);

    expect(payload.previewCards).toEqual([
      {
        name: 'Command and Conquer',
        imageUrl: 'http://127.0.0.1:3001/api/upscale/cached/abc123.webp',
      },
    ]);
  });

  it('restores an upscaled deck entry after saving and reloading the deck', async () => {
    installImageMock();
    upscaylMocks.upscaleImageUrl.mockClear();
    upscaylMocks.blobToObjectUrl.mockClear();
    upscaylMocks.blobToDataUrl.mockClear();

    const fetchMock = createAppFetchMock();
    global.fetch = fetchMock;

    const appRef = createRef();
    render(<App ref={appRef} />);

    await waitFor(() => {
      expect(appRef.current).toBeTruthy();
    });

    await waitFor(() => {
      expect(appRef.current.state.cards).not.toBeNull();
    });

    const commandCard = appRef.current.state.cards.find((card) => card.name === 'Command and Conquer');
    expect(commandCard).toBeTruthy();

    const upscaleResult = await appRef.current.createUpscaledPrinting(commandCard.printings[0]);
    expect(upscaleResult).toBeTruthy();

    appRef.current.setState({
      chosenCards: [
        {
          card: commandCard,
          printing: upscaleResult.upscaledPrinting,
          isSideboard: false,
        },
      ],
      saveDialogName: 'Upscaled Deck',
    });

    await waitFor(() => {
      expect(appRef.current.state.chosenCards).toHaveLength(1);
      expect(appRef.current.state.saveDialogName).toBe('Upscaled Deck');
    });

    await appRef.current.saveDeckWithName('', 'update');

    await waitFor(() => {
      expect(appRef.current.state.currentSavedDeckId).toBeTruthy();
    });

    const savedDeckId = appRef.current.state.currentSavedDeckId;

    appRef.current.setState({
      chosenCards: [],
      currentDeckName: '',
      currentSavedDeckId: '',
    });

    await appRef.current.performLoadSavedDeck(savedDeckId);

    await waitFor(() => {
      expect(appRef.current.state.chosenCards).toHaveLength(1);
      expect(appRef.current.state.chosenCards[0].printing?._upscaled).toBe(true);
    });

    const restoredEntry = appRef.current.state.chosenCards[0];
    expect(restoredEntry.printing.image_url).toBe('http://127.0.0.1:3001/api/upscale/cached/abc123.webp');
    expect(restoredEntry.printing._persisted_image_url).toBe('http://127.0.0.1:3001/api/upscale/cached/abc123.webp');
    expect(restoredEntry.printing._source_printing_id).toBe('printing-1');
  });

  it('upscales a chosen card from its quality badge, switches duplicate copies automatically, and restores the original on revert', async () => {
    installImageMock();
    upscaylMocks.upscaleImageUrl.mockClear();
    upscaylMocks.blobToObjectUrl.mockClear();
    global.fetch = createAppFetchMock();

    const appRef = createRef();
    render(<App ref={appRef} />);

    await waitFor(() => {
      expect(appRef.current).toBeTruthy();
    });

    await waitFor(() => {
      expect(appRef.current.state.cards).not.toBeNull();
    });

    const commandCard = appRef.current.state.cards.find((card) => card.name === 'Command and Conquer');
    expect(commandCard).toBeTruthy();

    appRef.current.setState({
      chosenCards: [
        { card: commandCard, printing: commandCard.printings[0], isSideboard: false },
        { card: commandCard, printing: commandCard.printings[0], isSideboard: false },
      ],
    });

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Open quality actions (Fair quality)' })).toHaveLength(2);
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Open quality actions (Fair quality)' })[0]);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Upscale current printing' }));

    await waitFor(() => {
      expect(screen.getAllByText('Upscaled')).toHaveLength(2);
      expect(screen.getAllByRole('button', { name: /Open quality actions/ })).toHaveLength(2);
    });

    expect(upscaylMocks.upscaleImageUrl).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Upscaled')).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Printing 1' })[0]);

    const upscaledMenu = await screen.findByRole('menu', { name: 'Printing options' });
    expect(within(upscaledMenu).getAllByRole('menuitemradio')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear deck' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Export PDF' })).toBeDisabled();
    });

    const upscaledCommandCard = appRef.current.state.cards.find((card) => card.name === 'Command and Conquer');
    expect(upscaledCommandCard).toBeTruthy();

    appRef.current.setState({
      chosenCards: [
        {
          card: upscaledCommandCard,
          printing: upscaledCommandCard.printings[0],
          isSideboard: false,
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByText('Upscaled')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Open quality actions/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Open quality actions/ }));
    const revertMenu = await screen.findByRole('menu', { name: 'Quality actions' });
    expect(within(revertMenu).getByText('Upscaled printing')).toBeInTheDocument();
    fireEvent.click(within(revertMenu).getByRole('menuitem', { name: 'Revert current printing' }));

    await waitFor(() => {
      expect(screen.queryByText('Upscaled')).toBeNull();
    });

    expect(screen.getByRole('button', { name: /Open quality actions \(Fair quality\)|Open quality actions \(Optimal quality\)/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear deck' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Export PDF' })).toBeDisabled();
    });

    const revertedCommandCard = appRef.current.state.cards.find((card) => card.name === 'Command and Conquer');
    expect(revertedCommandCard).toBeTruthy();

    appRef.current.setState({
      chosenCards: [
        {
          card: revertedCommandCard,
          printing: revertedCommandCard.printings[0],
          isSideboard: false,
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open quality actions (Fair quality)' })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Open quality actions (Upscaled printing)' })).not.toBeInTheDocument();
  });

  it('shows a local loading state for the targeted card while a single-card upscale is in flight without blocking the whole UI', async () => {
    installImageMock();
    const upscaleDeferred = createDeferred();
    upscaylMocks.upscaleImageUrl.mockImplementationOnce(() => upscaleDeferred.promise);
    global.fetch = createAppFetchMock();

    const appRef = createRef();
    render(<App ref={appRef} />);

    await waitFor(() => {
      expect(appRef.current).toBeTruthy();
    });

    await waitFor(() => {
      expect(appRef.current.state.cards).not.toBeNull();
    });

    appRef.current.setState({
      chosenCards: [
        { card: sampleCards[0], printing: sampleCards[0].printings[0], isSideboard: false },
        { card: sampleCards[0], printing: sampleCards[0].printings[0], isSideboard: false },
      ],
    });

    await waitFor(() => {
      const deckScrollRegion = screen.getByLabelText('Imported cards list');
      expect(within(deckScrollRegion).getAllByAltText('Command and Conquer')).toHaveLength(2);
    });

    const deckScrollRegion = screen.getByLabelText('Imported cards list');
    const qualityActionButtons = deckScrollRegion.querySelectorAll('button[title="Open quality actions"], button[title="Upscale this printing"]');

    expect(qualityActionButtons).toHaveLength(2);

    fireEvent.click(qualityActionButtons[0]);

    const qualityMenu = await screen.findByRole('menu', { name: 'Quality actions' });
    fireEvent.click(within(qualityMenu).getByRole('menuitem', { name: 'Upscale current printing' }));

    await waitFor(() => {
      expect(screen.queryByText('Upscaling image')).toBeNull();
      expect(screen.queryByText('Upscaling images')).toBeNull();
      expect(screen.getByLabelText('Upscaling Command and Conquer')).toBeInTheDocument();
    });

    expect(screen.getAllByLabelText('Upscaling Command and Conquer')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeEnabled();

    upscaleDeferred.resolve({ blob: new Blob(['upscaled'], { type: 'image/png' }), cacheUrl: '/api/upscale/cached/abc123.webp' });

    await waitFor(() => {
      expect(screen.queryByLabelText('Upscaling Command and Conquer')).toBeNull();
    });

    await waitFor(() => {
      expect(screen.getAllByText('Upscaled')).toHaveLength(2);
    });
  });

  it('shows a non-blocking import activity stream in the right pane while deck cards are still loading', async () => {
    installImageMock({ imageLoadDelayMs: 180 });
    global.fetch = createAppFetchMock({
      cardData: [
        {
          unique_id: 'card-1',
          name: 'Command and Conquer',
          pitch: '1',
          types: ['Attack Action'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'printing-1',
              image_url: 'https://example.com/card-1.png',
              image_rotation_degrees: 0,
            },
          ],
        },
        {
          unique_id: 'card-2',
          name: 'Sink Below',
          pitch: '3',
          types: ['Defense Reaction'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'printing-2',
              image_url: 'https://example.com/card-2.png',
              image_rotation_degrees: 0,
            },
          ],
        },
        {
          unique_id: 'card-3',
          name: 'Pummel',
          pitch: '1',
          types: ['Attack Reaction'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'printing-3',
              image_url: 'https://example.com/card-3.png',
              image_rotation_degrees: 0,
            },
          ],
        },
      ],
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste decklist here...')).toBeInTheDocument();
    });

    fireEvent.input(screen.getByPlaceholderText('Paste decklist here...'), {
      target: { value: '1x Command and Conquer\n1x Sink Below (blue)\n1x Pummel' },
    });

    const getDeckImportButton = () => screen.getAllByRole('button', { name: 'Import' }).at(-1);
    expect(getDeckImportButton()).toBeTruthy();

    await waitFor(() => {
      expect(getDeckImportButton()).toBeEnabled();
    });

    fireEvent.click(getDeckImportButton());

    const importActivity = await screen.findByRole('region', { name: 'Deck import activity' });
    const deckScrollRegion = screen.getByLabelText('Imported cards list');

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(within(importActivity).getByText('Importing into deck')).toBeInTheDocument();

    await waitFor(() => {
      expect(within(deckScrollRegion).getByAltText('Command and Conquer')).toBeInTheDocument();
      expect(within(deckScrollRegion).getAllByRole('button', { name: 'Printing 1' }).length).toBeGreaterThan(0);
      expect(within(deckScrollRegion).getByText('Sink Below')).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Deck import activity' })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Deck import activity' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
    });
  });

  it('lets the user abort a deck import and clears cards that were already added', async () => {
    installImageMock();
    const firstPrintingDeferred = createDeferred();
    const remainingPrintingsDeferred = createDeferred();

    imageQualityMocks.selectPrintingNewestMeeting300.mockImplementation(async (card) => {
      if (card?.unique_id === 'card-1') {
        await firstPrintingDeferred.promise;
      } else {
        await remainingPrintingsDeferred.promise;
      }

      return card?.printings?.[card.printings.length - 1] || null;
    });

    global.fetch = createAppFetchMock({
      cardData: [
        {
          unique_id: 'card-1',
          name: 'Command and Conquer',
          pitch: '1',
          types: ['Attack Action'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'printing-1',
              image_url: 'https://example.com/card-1.png',
              image_rotation_degrees: 0,
            },
          ],
        },
        {
          unique_id: 'card-2',
          name: 'Sink Below',
          pitch: '3',
          types: ['Defense Reaction'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'printing-2',
              image_url: 'https://example.com/card-2.png',
              image_rotation_degrees: 0,
            },
          ],
        },
        {
          unique_id: 'card-3',
          name: 'Pummel',
          pitch: '1',
          types: ['Attack Reaction'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'printing-3',
              image_url: 'https://example.com/card-3.png',
              image_rotation_degrees: 0,
            },
          ],
        },
      ],
    });

    try {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Paste decklist here...')).toBeInTheDocument();
      });

      fireEvent.input(screen.getByPlaceholderText('Paste decklist here...'), {
        target: { value: '1x Command and Conquer\n1x Sink Below (blue)\n1x Pummel' },
      });

      const getDeckImportButton = () => screen.getAllByRole('button', { name: 'Import' }).at(-1);

      await waitFor(() => {
        expect(getDeckImportButton()).toBeEnabled();
      });

      fireEvent.click(getDeckImportButton());

      const importActivity = await screen.findByRole('region', { name: 'Deck import activity' });
      const deckScrollRegion = screen.getByLabelText('Imported cards list');

      firstPrintingDeferred.resolve();

      await waitFor(() => {
        expect(within(deckScrollRegion).getByAltText('Command and Conquer')).toBeInTheDocument();
        expect(within(deckScrollRegion).getByText('Sink Below')).toBeInTheDocument();
        expect(within(deckScrollRegion).getByText('Pummel')).toBeInTheDocument();
        expect(within(deckScrollRegion).getAllByRole('button', { name: 'Printing 1' })).toHaveLength(1);
      });

      fireEvent.click(within(importActivity).getByRole('button', { name: 'Abort import' }));
      remainingPrintingsDeferred.resolve();

      await waitFor(() => {
        expect(screen.queryByRole('region', { name: 'Deck import activity' })).not.toBeInTheDocument();
        expect(within(deckScrollRegion).queryByAltText('Command and Conquer')).toBeNull();
        expect(within(deckScrollRegion).queryByText('Sink Below')).toBeNull();
        expect(within(deckScrollRegion).queryByText('Pummel')).toBeNull();
        expect(within(deckScrollRegion).queryAllByRole('button', { name: 'Printing 1' })).toHaveLength(0);
        expect(screen.getByRole('button', { name: 'Export PDF' })).toBeDisabled();
      });
    } finally {
      firstPrintingDeferred.resolve();
      remainingPrintingsDeferred.resolve();
      imageQualityMocks.selectPrintingNewestMeeting300.mockImplementation(
        async (card) => card?.printings?.[card.printings.length - 1] || null
      );
    }
  });

  it('auto-saves the current right-side deck and clears it before importing a replacement decklist', async () => {
    installImageMock({ imageLoadDelayMs: 120 });
    const fetchMock = createAppFetchMock({
      cardData: [
        {
          unique_id: 'card-1',
          name: 'Command and Conquer',
          pitch: '1',
          types: ['Attack Action'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'printing-1',
              image_url: 'https://example.com/card-1.png',
              image_rotation_degrees: 0,
            },
          ],
        },
        {
          unique_id: 'card-2',
          name: 'Sink Below',
          pitch: '3',
          types: ['Defense Reaction'],
          played_horizontally: false,
          printings: [
            {
              unique_id: 'printing-2',
              image_url: 'https://example.com/card-2.png',
              image_rotation_degrees: 0,
            },
          ],
        },
      ],
      savedDeckSummaries: [
        {
          id: 'deck-existing',
          name: 'Bravo Deck',
          savedAt: '2026-03-08T10:00:00.000Z',
          cardCount: 1,
          previewUrl: 'http://127.0.0.1:3001/api/decks/deck-existing/preview?v=2026-03-08T10%3A00%3A00.000Z',
        },
      ],
      deckRecords: [
        {
          id: 'deck-existing',
          name: 'Bravo Deck',
          savedAt: '2026-03-08T10:00:00.000Z',
          cards: [{ cardId: 'card-1', cardName: 'Command and Conquer', printingId: 'printing-1' }],
          previewCards: [{ name: 'Command and Conquer', imageUrl: 'https://example.com/card-1.png' }],
        },
      ],
    });
    global.fetch = fetchMock;

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Decks' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Decks' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load deck Bravo Deck' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.input(screen.getByRole('searchbox', { name: 'Archive search' }), {
      target: { value: 'Sink' },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      const deckScrollRegion = screen.getByLabelText('Imported cards list');
      expect(within(deckScrollRegion).getByAltText('Command and Conquer')).toBeInTheDocument();
      expect(within(deckScrollRegion).getByAltText('Sink Below')).toBeInTheDocument();
    });

    const getDeckImportButton = () => screen.getAllByRole('button', { name: 'Import' }).at(-1);
    fireEvent.click(getDeckImportButton());
    fireEvent.input(screen.getByPlaceholderText('Paste decklist here...'), {
      target: { value: '1x Sink Below (blue)' },
    });

    await waitFor(() => {
      expect(getDeckImportButton()).toBeEnabled();
    });

    fireEvent.click(getDeckImportButton());

    const deckScrollRegion = screen.getByLabelText('Imported cards list');

    expect(screen.queryByRole('dialog', { name: 'Save deck' })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(within(deckScrollRegion).queryByAltText('Command and Conquer')).not.toBeInTheDocument();
    });

    const autoSaveCall = fetchMock.mock.calls.find(
      ([url, init]) => url === 'http://127.0.0.1:3001/api/decks' && init?.method === 'POST' && JSON.parse(init.body).id === 'deck-existing'
    );

    expect(autoSaveCall).toBeTruthy();
    expect(JSON.parse(autoSaveCall[1].body)).toMatchObject({
      id: 'deck-existing',
      name: 'Bravo Deck',
      cards: [
        { cardId: 'card-1', cardName: 'Command and Conquer', printingId: 'printing-1' },
        { cardId: 'card-2', cardName: 'Sink Below', printingId: 'printing-2' },
      ],
    });

    await waitFor(() => {
      expect(within(deckScrollRegion).getByAltText('Sink Below')).toBeInTheDocument();
      expect(within(deckScrollRegion).queryByAltText('Command and Conquer')).not.toBeInTheDocument();
    });
  });

  it('shows the first ten saved cards as a stacked preview for each saved deck', async () => {
    installImageMock();
    global.fetch = createAppFetchMock({
      cardData: previewCards,
      savedDeckSummaries: [
        {
          id: 'deck-preview',
          name: 'Preview Deck',
          savedAt: '2026-03-08T10:00:00.000Z',
          cardCount: previewCards.length,
          previewUrl: 'http://127.0.0.1:3001/api/decks/deck-preview/preview?v=2026-03-08T10%3A00%3A00.000Z',
        },
      ],
      deckRecords: [
        {
          id: 'deck-preview',
          name: 'Preview Deck',
          savedAt: '2026-03-08T10:00:00.000Z',
          cards: previewCards.map((card) => ({
            cardId: card.unique_id,
            cardName: card.name,
            printingId: card.printings[0].unique_id,
          })),
        },
      ],
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Decks' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Decks' }));

    const preview = await screen.findByLabelText('Preview cards for Preview Deck');
    const previewImage = within(preview).getByRole('img', { name: 'Preview for Preview Deck' });
    const loadButton = screen.getByRole('button', { name: 'Load deck Preview Deck' });
    const deleteButton = screen.getByRole('button', { name: 'Delete saved deck Preview Deck' });
    const actionRow = loadButton.parentElement;
    const savedDeckCard = screen.getByText('Preview Deck').closest('[data-saved-deck-card]');
    const savedDeckRow = savedDeckCard?.firstElementChild;

    expect(previewImage).toHaveAttribute(
      'src',
      'http://127.0.0.1:3001/api/decks/deck-preview/preview?v=2026-03-08T10%3A00%3A00.000Z'
    );
    expect(previewImage).toHaveClass('object-cover');
    expect(previewImage).toHaveClass('block');
    expect(preview.parentElement).toHaveClass('items-end');
    expect(preview.parentElement).toHaveClass('-mb-3');
    expect(savedDeckRow?.lastElementChild).toHaveClass('gap-3');
    expect(savedDeckCard).not.toBeNull();
    expect(savedDeckCard).toHaveClass('overflow-hidden');
    expect(savedDeckCard).toHaveClass('left-pane-raised-surface');
    expect(savedDeckRow).not.toBeNull();
    expect(savedDeckRow).toHaveClass('md:items-stretch');
    expect(actionRow).toContainElement(deleteButton);
    expect(actionRow).toHaveClass('justify-start');
  });

  it('renders the saved deck search and format filter in a shared controls row', async () => {
    installImageMock();
    global.fetch = createAppFetchMock();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Decks' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Decks' }));

    const searchInput = await screen.findByRole('searchbox', { name: 'Saved deck search' });
    const formatFilterTrigger = screen.getByRole('button', { name: 'Saved deck format filter' });
    const controlsRow = screen.getByTestId('saved-decks-controls');

    expect(controlsRow).toContainElement(searchInput);
    expect(controlsRow).toContainElement(formatFilterTrigger);
    expect(controlsRow).toHaveClass('flex');
    expect(controlsRow).toHaveClass('items-center');
    expect(searchInput).toHaveClass('flex-1');
    expect(formatFilterTrigger.parentElement).toHaveClass('shrink-0');
  });

  it('filters saved decks by classic constructed and silver age metadata', async () => {
    installImageMock();
    global.fetch = createAppFetchMock({
      savedDeckSummaries: [
        {
          id: 'deck-cc',
          name: 'Bravo CC',
          format: 'classic-constructed',
          savedAt: '2026-03-08T10:00:00.000Z',
          cardCount: 61,
          previewUrl: 'http://127.0.0.1:3001/api/decks/deck-cc/preview?v=2026-03-08T10%3A00%3A00.000Z',
        },
        {
          id: 'deck-sa',
          name: 'Arakni Silver',
          format: 'silver-age',
          savedAt: '2026-03-07T10:00:00.000Z',
          cardCount: 60,
          previewUrl: 'http://127.0.0.1:3001/api/decks/deck-sa/preview?v=2026-03-07T10%3A00%3A00.000Z',
        },
      ],
      deckRecords: [
        {
          id: 'deck-cc',
          name: 'Bravo CC',
          format: 'classic-constructed',
          savedAt: '2026-03-08T10:00:00.000Z',
          cards: [],
        },
        {
          id: 'deck-sa',
          name: 'Arakni Silver',
          format: 'silver-age',
          savedAt: '2026-03-07T10:00:00.000Z',
          cards: [],
        },
      ],
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Decks' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Decks' }));

    await waitFor(() => {
      expect(screen.getByText('Bravo CC')).toBeInTheDocument();
      expect(screen.getByText('Arakni Silver')).toBeInTheDocument();
    });

    const bravoDeckCard = screen.getByText('Bravo CC').closest('[data-saved-deck-card]');
    const arakniDeckCard = screen.getByText('Arakni Silver').closest('[data-saved-deck-card]');
    const bravoFormatBadge = within(bravoDeckCard).getByText('Classic Constructed');
    const arakniFormatBadge = within(arakniDeckCard).getByText('Silver Age');

    expect(bravoDeckCard).not.toBeNull();
    expect(arakniDeckCard).not.toBeNull();
    expect(bravoFormatBadge).toBeInTheDocument();
    expect(arakniFormatBadge).toBeInTheDocument();
    expect(bravoFormatBadge.closest('button')).not.toBeNull();
    expect(arakniFormatBadge.closest('button')).not.toBeNull();
    expect(bravoFormatBadge.closest('button')).toHaveClass('text-muted-foreground');
    expect(arakniFormatBadge.closest('button')).toHaveClass('text-muted-foreground');

    fireEvent.click(screen.getByRole('button', { name: 'Saved deck format filter' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Silver Age' }));

    await waitFor(() => {
      expect(screen.queryByText('Bravo CC')).not.toBeInTheDocument();
      expect(screen.getByText('Arakni Silver')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Saved deck format filter' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Classic Constructed' }));

    await waitFor(() => {
      expect(screen.getByText('Bravo CC')).toBeInTheDocument();
      expect(screen.queryByText('Arakni Silver')).not.toBeInTheDocument();
    });
  });

  it('lets the user assign a deck type from the saved deck badge slot when none is set', async () => {
    installImageMock();

    const fetchMock = createAppFetchMock({
      savedDeckSummaries: [
        {
          id: 'deck-untyped',
          name: 'Oldhim Deck',
          format: '',
          savedAt: '2026-03-08T10:00:00.000Z',
          cardCount: 56,
          previewUrl: 'http://127.0.0.1:3001/api/decks/deck-untyped/preview?v=2026-03-08T10%3A00%3A00.000Z',
        },
      ],
      deckRecords: [
        {
          id: 'deck-untyped',
          name: 'Oldhim Deck',
          format: '',
          savedAt: '2026-03-08T10:00:00.000Z',
          cards: [{ cardId: 'hero-card', cardName: 'Oldhim', printingId: 'hero-printing' }],
          previewCards: [{ name: 'Oldhim', imageUrl: 'https://example.com/oldhim.png' }],
        },
      ],
    });

    global.fetch = fetchMock;

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Decks' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Decks' }));

    await waitFor(() => {
      expect(screen.getByText('Oldhim Deck')).toBeInTheDocument();
    });

    const formatTrigger = screen.getByRole('button', { name: 'Saved deck type Oldhim Deck' });

    expect(formatTrigger).toHaveTextContent('Set deck type');
    expect(formatTrigger).toHaveAttribute('data-variant', 'ghost');
    expect(formatTrigger).toHaveClass('rounded-full');
    expect(formatTrigger).toHaveClass('border-border/70');
    expect(formatTrigger).toHaveClass('bg-card/90');
    expect(formatTrigger.parentElement).toHaveClass('inline-flex');
    expect(within(formatTrigger).getByText('Set deck type')).toHaveClass('whitespace-nowrap');
    expect(within(formatTrigger).getByText('Set deck type')).not.toHaveClass('truncate');

    fireEvent.click(formatTrigger);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Classic Constructed' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Saved deck type Oldhim Deck' })).toHaveTextContent('Classic Constructed');
    });

    const saveDeckCall = fetchMock.mock.calls.find(
      ([url, init]) => url === 'http://127.0.0.1:3001/api/decks' && init?.method === 'POST'
    );

    expect(saveDeckCall).toBeTruthy();
    expect(JSON.parse(saveDeckCall[1].body)).toMatchObject({
      id: 'deck-untyped',
      name: 'Oldhim Deck',
      format: 'classic-constructed',
    });
  });

  it('filters imported cards into pitch, sideboard, and hero plus arena groups', async () => {
    installImageMock();
    global.fetch = createAppFetchMock({ cardData: categorizedCards });

    const appRef = createRef();
    render(<App ref={appRef} />);

    await waitFor(() => {
      expect(appRef.current).toBeTruthy();
    });

    await waitFor(() => {
      expect(appRef.current.state.cards).toEqual(categorizedCards);
    });

    const cardsByName = Object.fromEntries(categorizedCards.map((card) => [card.name, card]));
    appRef.current.setState({
      chosenCards: [
        { card: cardsByName['Filter Hero'], printing: cardsByName['Filter Hero'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Equipment'], printing: cardsByName['Filter Equipment'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Ally'], printing: cardsByName['Filter Ally'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Sideboard'], printing: cardsByName['Filter Sideboard'].printings[0], isSideboard: true },
        { card: cardsByName['Filter Red'], printing: cardsByName['Filter Red'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Yellow'], printing: cardsByName['Filter Yellow'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Blue'], printing: cardsByName['Filter Blue'].printings[0], isSideboard: false },
      ],
    });

    await waitFor(() => {
      expect(screen.getByText('Filter Hero')).toBeInTheDocument();
      expect(screen.queryByText('Filter Sideboard')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Sideboard/ }));

    await waitFor(() => {
      expect(screen.getByText('Filter Sideboard')).toBeInTheDocument();
      expect(screen.queryByText('Filter Hero')).not.toBeInTheDocument();
      expect(screen.queryByText('Filter Equipment')).not.toBeInTheDocument();
      expect(screen.queryByText('Filter Ally')).not.toBeInTheDocument();
      expect(screen.queryByText('Filter Red')).not.toBeInTheDocument();
      expect(screen.queryByText('Filter Yellow')).not.toBeInTheDocument();
      expect(screen.queryByText('Filter Blue')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Hero \+ Arena/ }));

    await waitFor(() => {
      expect(screen.getByText('Filter Hero')).toBeInTheDocument();
      expect(screen.getByText('Filter Equipment')).toBeInTheDocument();
      expect(screen.getByText('Filter Ally')).toBeInTheDocument();
      expect(screen.queryByText('Filter Sideboard')).not.toBeInTheDocument();
      expect(screen.queryByText('Filter Red')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Red/ }));

    await waitFor(() => {
      expect(screen.getByText('Filter Red')).toBeInTheDocument();
      expect(screen.queryByText('Filter Yellow')).not.toBeInTheDocument();
      expect(screen.queryByText('Filter Blue')).not.toBeInTheDocument();
      expect(screen.queryByText('Filter Hero')).not.toBeInTheDocument();
    });
  });

  it('lets the user shift-select deck cards and move them to the explicit sideboard with a right-click menu', async () => {
    installImageMock();
    const fetchMock = createAppFetchMock({ cardData: categorizedCards });
    global.fetch = fetchMock;

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste decklist here...')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.input(screen.getByRole('searchbox', { name: 'Archive search' }), {
      target: { value: 'Filter' },
    });

    const redArchiveRow = await screen.findByLabelText('Archive card Filter Red');
    const yellowArchiveRow = await screen.findByLabelText('Archive card Filter Yellow');
    const blueArchiveRow = await screen.findByLabelText('Archive card Filter Blue');

    fireEvent.click(within(redArchiveRow).getByRole('button', { name: 'Add' }));
    fireEvent.click(within(yellowArchiveRow).getByRole('button', { name: 'Add' }));
    fireEvent.click(within(blueArchiveRow).getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
    });

    const deckScrollRegion = screen.getByLabelText('Imported cards list');
    const redCard = within(deckScrollRegion).getByText('Filter Red').closest('.card-card');
    const blueCard = within(deckScrollRegion).getByText('Filter Blue').closest('.card-card');

    expect(redCard).not.toBeNull();
    expect(blueCard).not.toBeNull();

    fireEvent.click(redCard);
    fireEvent.click(blueCard, { shiftKey: true });

    await waitFor(() => {
      expect(within(deckScrollRegion).getByRole('option', { name: 'Filter Red' })).toHaveAttribute('aria-selected', 'true');
      expect(within(deckScrollRegion).getByRole('option', { name: 'Filter Yellow' })).toHaveAttribute('aria-selected', 'true');
      expect(within(deckScrollRegion).getByRole('option', { name: 'Filter Blue' })).toHaveAttribute('aria-selected', 'true');
    });

    fireEvent.contextMenu(within(deckScrollRegion).getByRole('option', { name: 'Filter Blue' }));

    const contextMenu = await screen.findByRole('menu', { name: 'Deck card actions' });
    fireEvent.click(within(contextMenu).getByRole('menuitem', { name: 'Move 3 cards to sideboard' }));

    fireEvent.click(screen.getByRole('button', { name: /Sideboard/ }));

    await waitFor(() => {
      expect(within(deckScrollRegion).getByText('Filter Red')).toBeInTheDocument();
      expect(within(deckScrollRegion).getByText('Filter Yellow')).toBeInTheDocument();
      expect(within(deckScrollRegion).getByText('Filter Blue')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save deck' }));

    const saveDialog = await screen.findByRole('dialog', { name: 'Save deck' });
    fireEvent.input(within(saveDialog).getByRole('textbox', { name: 'Deck name' }), {
      target: { value: 'Shift Sideboard Deck' },
    });
    fireEvent.click(within(saveDialog).getByRole('button', { name: 'Save deck' }));

    await waitFor(() => {
      expect(getLastSaveDeckPayload(fetchMock)).toMatchObject({
        name: 'Shift Sideboard Deck',
        cards: [
          expect.objectContaining({ cardId: 'red-card', isSideboard: true }),
          expect.objectContaining({ cardId: 'yellow-card', isSideboard: true }),
          expect.objectContaining({ cardId: 'blue-card', isSideboard: true }),
        ],
      });
    });
  });

  it('clears the current deck-card selection when escape is pressed', async () => {
    installImageMock();
    global.fetch = createAppFetchMock({ cardData: categorizedCards });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste decklist here...')).toBeInTheDocument();
    });

    await addCardsFromArchive(['Filter Red', 'Filter Yellow', 'Filter Blue']);

    const deckScrollRegion = screen.getByLabelText('Imported cards list');

    fireEvent.click(within(deckScrollRegion).getByRole('option', { name: 'Filter Red' }));
    fireEvent.click(within(deckScrollRegion).getByRole('option', { name: 'Filter Blue' }), { shiftKey: true });

    await waitFor(() => {
      expect(within(deckScrollRegion).getByRole('option', { name: 'Filter Red' }).getAttribute('aria-selected')).toBe('true');
      expect(within(deckScrollRegion).getByRole('option', { name: 'Filter Yellow' }).getAttribute('aria-selected')).toBe('true');
      expect(within(deckScrollRegion).getByRole('option', { name: 'Filter Blue' }).getAttribute('aria-selected')).toBe('true');
    });

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(within(deckScrollRegion).getByRole('option', { name: 'Filter Red' }).getAttribute('aria-selected')).toBe('false');
      expect(within(deckScrollRegion).getByRole('option', { name: 'Filter Yellow' }).getAttribute('aria-selected')).toBe('false');
      expect(within(deckScrollRegion).getByRole('option', { name: 'Filter Blue' }).getAttribute('aria-selected')).toBe('false');
    });
  });

  it('clears the current deck-card selection when clicking outside the deck cards', async () => {
    installImageMock();
    global.fetch = createAppFetchMock({ cardData: categorizedCards });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste decklist here...')).toBeInTheDocument();
    });

    await addCardsFromArchive(['Filter Red', 'Filter Yellow', 'Filter Blue']);

    const deckScrollRegion = screen.getByLabelText('Imported cards list');

    fireEvent.click(within(deckScrollRegion).getByRole('option', { name: 'Filter Red' }));
    fireEvent.click(within(deckScrollRegion).getByRole('option', { name: 'Filter Blue' }), { shiftKey: true });

    await waitFor(() => {
      expect(within(deckScrollRegion).getByRole('option', { name: 'Filter Red' }).getAttribute('aria-selected')).toBe('true');
      expect(within(deckScrollRegion).getByRole('option', { name: 'Filter Yellow' }).getAttribute('aria-selected')).toBe('true');
      expect(within(deckScrollRegion).getByRole('option', { name: 'Filter Blue' }).getAttribute('aria-selected')).toBe('true');
    });

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Export PDF' }));

    await waitFor(() => {
      expect(within(deckScrollRegion).getByRole('option', { name: 'Filter Red' }).getAttribute('aria-selected')).toBe('false');
      expect(within(deckScrollRegion).getByRole('option', { name: 'Filter Yellow' }).getAttribute('aria-selected')).toBe('false');
      expect(within(deckScrollRegion).getByRole('option', { name: 'Filter Blue' }).getAttribute('aria-selected')).toBe('false');
    });
  });

  it('hides sideboard cards from the main deck tab after moving them to the sideboard', async () => {
    installImageMock();
    global.fetch = createAppFetchMock({ cardData: categorizedCards });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste decklist here...')).toBeInTheDocument();
    });

    await addCardsFromArchive(['Filter Red', 'Filter Yellow', 'Filter Blue']);

    const deckScrollRegion = screen.getByLabelText('Imported cards list');

    fireEvent.click(within(deckScrollRegion).getByRole('option', { name: 'Filter Red' }));
    fireEvent.click(within(deckScrollRegion).getByRole('option', { name: 'Filter Blue' }), { shiftKey: true });
    fireEvent.contextMenu(within(deckScrollRegion).getByRole('option', { name: 'Filter Blue' }));

    const contextMenu = await screen.findByRole('menu', { name: 'Deck card actions' });
    fireEvent.click(within(contextMenu).getByRole('menuitem', { name: 'Move 3 cards to sideboard' }));

    await waitFor(() => {
      expect(within(deckScrollRegion).queryByText('Filter Red')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Yellow')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Blue')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Sideboard/ }));

    await waitFor(() => {
      expect(within(deckScrollRegion).getByText('Filter Red')).toBeInTheDocument();
      expect(within(deckScrollRegion).getByText('Filter Yellow')).toBeInTheDocument();
      expect(within(deckScrollRegion).getByText('Filter Blue')).toBeInTheDocument();
    });
  });

  it('moves selected sideboard cards back into the main deck with the deck-card context menu', async () => {
    installImageMock();
    global.fetch = createAppFetchMock({ cardData: categorizedCards });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste decklist here...')).toBeInTheDocument();
    });

    await addCardsFromArchive(['Filter Red', 'Filter Yellow', 'Filter Blue']);

    const deckScrollRegion = screen.getByLabelText('Imported cards list');

    fireEvent.click(within(deckScrollRegion).getByRole('option', { name: 'Filter Red' }));
    fireEvent.click(within(deckScrollRegion).getByRole('option', { name: 'Filter Blue' }), { shiftKey: true });
    fireEvent.contextMenu(within(deckScrollRegion).getByRole('option', { name: 'Filter Blue' }));

    let contextMenu = await screen.findByRole('menu', { name: 'Deck card actions' });
    fireEvent.click(within(contextMenu).getByRole('menuitem', { name: 'Move 3 cards to sideboard' }));

    fireEvent.click(screen.getByRole('button', { name: /Sideboard/ }));

    await waitFor(() => {
      expect(within(deckScrollRegion).getByText('Filter Red')).toBeInTheDocument();
      expect(within(deckScrollRegion).getByText('Filter Yellow')).toBeInTheDocument();
      expect(within(deckScrollRegion).getByText('Filter Blue')).toBeInTheDocument();
    });

    fireEvent.click(within(deckScrollRegion).getByRole('option', { name: 'Filter Red' }));
    fireEvent.click(within(deckScrollRegion).getByRole('option', { name: 'Filter Blue' }), { shiftKey: true });
    fireEvent.contextMenu(within(deckScrollRegion).getByRole('option', { name: 'Filter Blue' }));

    contextMenu = await screen.findByRole('menu', { name: 'Deck card actions' });
    fireEvent.click(within(contextMenu).getByRole('menuitem', { name: 'Move 3 cards to main deck' }));

    await waitFor(() => {
      expect(within(deckScrollRegion).queryByText('Filter Red')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Yellow')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Blue')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^All\b/ }));

    await waitFor(() => {
      expect(within(deckScrollRegion).getByText('Filter Red')).toBeInTheDocument();
      expect(within(deckScrollRegion).getByText('Filter Yellow')).toBeInTheDocument();
      expect(within(deckScrollRegion).getByText('Filter Blue')).toBeInTheDocument();
    });
  });

  it('deletes all selected deck cards from the deck-card context menu', async () => {
    installImageMock();
    global.fetch = createAppFetchMock({ cardData: categorizedCards });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste decklist here...')).toBeInTheDocument();
    });

    await addCardsFromArchive(['Filter Red', 'Filter Yellow', 'Filter Blue']);

    const deckScrollRegion = screen.getByLabelText('Imported cards list');

    fireEvent.click(within(deckScrollRegion).getByRole('option', { name: 'Filter Red' }));
    fireEvent.click(within(deckScrollRegion).getByRole('option', { name: 'Filter Blue' }), { shiftKey: true });
    fireEvent.contextMenu(within(deckScrollRegion).getByRole('option', { name: 'Filter Yellow' }));

    const contextMenu = await screen.findByRole('menu', { name: 'Deck card actions' });
    fireEvent.click(within(contextMenu).getByRole('menuitem', { name: 'Delete 3 cards from deck' }));

    await waitFor(() => {
      expect(within(deckScrollRegion).queryByText('Filter Red')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Yellow')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Blue')).not.toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeDisabled();
  });

  it('filters the right deck pane when a metrics bar chart bar is clicked', async () => {
    installImageMock();
    global.fetch = createAppFetchMock({ cardData: categorizedCards });

    const appRef = createRef();
    render(<App ref={appRef} />);

    await waitFor(() => {
      expect(appRef.current).toBeTruthy();
    });

    await waitFor(() => {
      expect(appRef.current.state.cards).toEqual(categorizedCards);
    });

    const cardsByName = Object.fromEntries(categorizedCards.map((card) => [card.name, card]));
    appRef.current.setState({
      chosenCards: [
        { card: cardsByName['Filter Hero'], printing: cardsByName['Filter Hero'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Equipment'], printing: cardsByName['Filter Equipment'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Ally'], printing: cardsByName['Filter Ally'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Sideboard'], printing: cardsByName['Filter Sideboard'].printings[0], isSideboard: true },
        { card: cardsByName['Filter Red'], printing: cardsByName['Filter Red'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Yellow'], printing: cardsByName['Filter Yellow'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Blue'], printing: cardsByName['Filter Blue'].printings[0], isSideboard: false },
      ],
    });

    await waitFor(() => {
      expect(screen.getByText('Filter Hero')).toBeInTheDocument();
      expect(screen.getByText('Filter Red')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Metrics' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Deck metrics' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Apply metric filter pitch Red' }));

    const deckScrollRegion = screen.getByLabelText('Imported cards list');

    await waitFor(() => {
      expect(within(deckScrollRegion).getByText('Filter Red')).toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Yellow')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Blue')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Hero')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Equipment')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Ally')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Sideboard')).not.toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Clear metric filter Pitch: Red' })).toBeInTheDocument();
  });

  it('falls back to the import tab and disables metrics when the open deck is cleared', async () => {
    installImageMock();
    global.fetch = createAppFetchMock({ cardData: categorizedCards });

    const appRef = createRef();
    render(<App ref={appRef} />);

    await waitFor(() => {
      expect(appRef.current).toBeTruthy();
    });

    await waitFor(() => {
      expect(appRef.current.state.cards).toEqual(categorizedCards);
    });

    const cardsByName = Object.fromEntries(categorizedCards.map((card) => [card.name, card]));
    appRef.current.setState({
      chosenCards: [
        { card: cardsByName['Filter Red'], printing: cardsByName['Filter Red'].printings[0], isSideboard: false },
      ],
      currentSavedDeckId: 'deck-red',
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Metrics' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Metrics' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Deck metrics' })).toBeInTheDocument();
    });

    appRef.current.clearChosenCards();

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste decklist here...')).toBeInTheDocument();
    });

    expect(screen.queryByRole('heading', { name: 'Deck metrics' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Metrics' })).toBeDisabled();
  });

  it('filters the right deck pane when a rarity metric filter is selected', async () => {
    installImageMock();
    global.fetch = createAppFetchMock({ cardData: categorizedCards });

    const appRef = createRef();
    render(<App ref={appRef} />);

    await waitFor(() => {
      expect(appRef.current).toBeTruthy();
    });

    await waitFor(() => {
      expect(appRef.current.state.cards).toEqual(categorizedCards);
    });

    const cardsByName = Object.fromEntries(categorizedCards.map((card) => [card.name, card]));
    appRef.current.setState({
      chosenCards: [
        {
          card: cardsByName['Filter Hero'],
          printing: { ...cardsByName['Filter Hero'].printings[0], rarity: 'T' },
          isSideboard: false,
        },
        {
          card: cardsByName['Filter Equipment'],
          printing: { ...cardsByName['Filter Equipment'].printings[0], rarity: 'C' },
          isSideboard: false,
        },
        {
          card: cardsByName['Filter Ally'],
          printing: { ...cardsByName['Filter Ally'].printings[0], rarity: 'R' },
          isSideboard: false,
        },
        {
          card: cardsByName['Filter Sideboard'],
          printing: { ...cardsByName['Filter Sideboard'].printings[0], rarity: 'C' },
          isSideboard: true,
        },
        {
          card: cardsByName['Filter Red'],
          printing: { ...cardsByName['Filter Red'].printings[0], rarity: 'M' },
          isSideboard: false,
        },
        {
          card: cardsByName['Filter Yellow'],
          printing: { ...cardsByName['Filter Yellow'].printings[0], rarity: 'C' },
          isSideboard: false,
        },
        {
          card: cardsByName['Filter Blue'],
          printing: { ...cardsByName['Filter Blue'].printings[0], rarity: 'R' },
          isSideboard: false,
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByText('Filter Red')).toBeInTheDocument();
      expect(screen.getByText('Filter Yellow')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Metrics' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Deck metrics' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Apply metric filter rarity Majestic' }));

    const deckScrollRegion = screen.getByLabelText('Imported cards list');

    await waitFor(() => {
      expect(within(deckScrollRegion).getByText('Filter Red')).toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Yellow')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Blue')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Hero')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Equipment')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Ally')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Sideboard')).not.toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Clear metric filter Rarity: Majestic' })).toBeInTheDocument();
  });

  it('keeps imported cards inside a dedicated scrollable deck container', async () => {
    installImageMock();
    global.fetch = createAppFetchMock();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.input(screen.getByRole('searchbox', { name: 'Archive search' }), {
      target: { value: 'Command' },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    const deckPane = screen.getByLabelText('Imported cards panel');
    const deckScrollRegion = screen.getByLabelText('Imported cards list');

    await waitFor(() => {
      expect(deckScrollRegion.querySelector('.card-grid .card-card')).not.toBeNull();
    });

    const renderedDeckCard = deckScrollRegion.querySelector('.card-grid .card-card');

    expect(deckPane).toHaveClass('deck-pane');
    expect(deckScrollRegion).toHaveClass('deck-pane-scroll');
    expect(deckPane).toContainElement(deckScrollRegion);
    expect(deckScrollRegion.querySelector('.card-grid')).not.toBeNull();
    expect(renderedDeckCard).not.toBeNull();
  });

  it('locks the app shell to the viewport and keeps both pane bodies scrollable', async () => {
    installImageMock();
    global.fetch = createAppFetchMock();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste decklist here...')).toBeInTheDocument();
    });

    const appShell = document.querySelector('.app-shell');
    const workspaceGrid = document.querySelector('.workspace-grid');
    const leftPaneShell = document.querySelector('.left-pane-shell');
    const deckPane = screen.getByLabelText('Imported cards panel');
    const leftPaneScrollRegion = document.querySelector('.left-pane-panel-content');
    const deckScrollRegion = screen.getByLabelText('Imported cards list');

    expect(appShell).not.toBeNull();
    expect(appShell).toHaveClass('h-dvh');
    expect(appShell).toHaveClass('overflow-hidden');
    expect(workspaceGrid).not.toBeNull();
    expect(workspaceGrid).toHaveClass('h-full');
    expect(workspaceGrid).toHaveClass('min-h-0');
    expect(leftPaneShell).not.toBeNull();
    expect(leftPaneShell).toHaveClass('h-full');
    expect(leftPaneShell).toHaveClass('min-h-0');
    expect(leftPaneScrollRegion).not.toBeNull();
    expect(leftPaneScrollRegion).toHaveClass('overflow-y-auto');
    expect(deckPane).toHaveClass('h-full');
    expect(deckPane).toHaveClass('min-h-0');
    expect(deckScrollRegion).toHaveClass('overflow-y-auto');
  });

  it('only marks the deck scrollbar visible while the user is actively scrolling', async () => {
    installImageMock();
    global.fetch = createAppFetchMock();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste decklist here...')).toBeInTheDocument();
    });

    fireEvent.input(screen.getByPlaceholderText('Paste decklist here...'), {
      target: { value: '1x Command and Conquer' },
    });

    const getDeckImportButton = () => screen.getAllByRole('button', { name: 'Import' }).at(-1);
    expect(getDeckImportButton()).toBeTruthy();

    await waitFor(() => {
      expect(getDeckImportButton()).toBeEnabled();
    });

    fireEvent.click(getDeckImportButton());

    const deckScrollRegion = screen.getByLabelText('Imported cards list');

    await waitFor(() => {
      expect(deckScrollRegion.querySelector('.card-grid .card-card')).not.toBeNull();
    });

    expect(deckScrollRegion).not.toHaveClass('is-scrolling');

    fireEvent.scroll(deckScrollRegion, { target: { scrollTop: 120 } });

    expect(deckScrollRegion).toHaveClass('is-scrolling');

    await waitFor(
      () => {
        expect(deckScrollRegion).not.toHaveClass('is-scrolling');
      },
      { timeout: 2000 }
    );
  });

  it('uses rail-less scrollbar styling across app scroll regions and menus', async () => {
    installImageMock();
    global.fetch = createAppFetchMock();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    });

    const leftPaneScrollRegion = document.querySelector('.left-pane-scroll');
    expect(leftPaneScrollRegion).not.toBeNull();
    expect(leftPaneScrollRegion).toHaveClass('scrollbar-rail-less');
    expect(leftPaneScrollRegion).toHaveClass('scrollbar-stable');

    fireEvent.input(screen.getByPlaceholderText('Paste decklist here...'), {
      target: { value: '1x Command and Conquer' },
    });

    const getDeckImportButton = () => screen.getAllByRole('button', { name: 'Import' }).at(-1);
    expect(getDeckImportButton()).toBeTruthy();

    await waitFor(() => {
      expect(getDeckImportButton()).toBeEnabled();
    });

    fireEvent.click(getDeckImportButton());

    const deckScrollRegion = screen.getByLabelText('Imported cards list');

    await waitFor(() => {
      expect(within(deckScrollRegion).getByRole('button', { name: 'Printing 1' })).toBeInTheDocument();
    });

    expect(deckScrollRegion).toHaveClass('scrollbar-rail-less');
    expect(deckScrollRegion).toHaveClass('scrollbar-stable');

    fireEvent.click(within(deckScrollRegion).getByRole('button', { name: 'Printing 1' }));

    const printingMenu = await screen.findByRole('menu', { name: 'Printing options' });
    const printingMenuScrollRegion = printingMenu.querySelector('.scrollbar-rail-less');

    expect(printingMenuScrollRegion).not.toBeNull();
    expect(printingMenuScrollRegion).toHaveClass('scrollbar-stable');
  });

  it('supports keyboard shortcuts for focusing archive search and switching left tabs', async () => {
    installImageMock();
    global.fetch = createAppFetchMock();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste decklist here...')).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: '2' });

    await waitFor(() => {
      expect(screen.getByRole('searchbox', { name: 'Archive search' })).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: '3' });

    await waitFor(() => {
      expect(screen.getByRole('searchbox', { name: 'Saved deck search' })).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: '4' });

    expect(screen.queryByRole('heading', { name: 'Deck metrics' })).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Saved deck search' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: '1' });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste decklist here...')).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'f' });

    await waitFor(() => {
      expect(screen.getByRole('searchbox', { name: 'Archive search' })).toBeInTheDocument();
    });
    expect(screen.getByRole('searchbox', { name: 'Archive search' })).toHaveFocus();
  });

  it('cycles the right deck pane filters with the Tab hotkey', async () => {
    installImageMock();
    global.fetch = createAppFetchMock({ cardData: categorizedCards });

    const appRef = createRef();
    render(<App ref={appRef} />);

    await waitFor(() => {
      expect(appRef.current).toBeTruthy();
    });

    await waitFor(() => {
      expect(appRef.current.state.cards).toEqual(categorizedCards);
    });

    const cardsByName = Object.fromEntries(categorizedCards.map((card) => [card.name, card]));
    appRef.current.setState({
      chosenCards: [
        { card: cardsByName['Filter Hero'], printing: cardsByName['Filter Hero'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Equipment'], printing: cardsByName['Filter Equipment'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Ally'], printing: cardsByName['Filter Ally'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Sideboard'], printing: cardsByName['Filter Sideboard'].printings[0], isSideboard: true },
        { card: cardsByName['Filter Red'], printing: cardsByName['Filter Red'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Yellow'], printing: cardsByName['Filter Yellow'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Blue'], printing: cardsByName['Filter Blue'].printings[0], isSideboard: false },
      ],
    });

    const deckScrollRegion = screen.getByLabelText('Imported cards list');

    await waitFor(() => {
      expect(within(deckScrollRegion).getByText('Filter Hero')).toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Sideboard')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).getByText('Filter Red')).toBeInTheDocument();
      expect(within(deckScrollRegion).getByText('Filter Yellow')).toBeInTheDocument();
      expect(within(deckScrollRegion).getByText('Filter Blue')).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'Tab' });

    await waitFor(() => {
      expect(within(deckScrollRegion).getByText('Filter Red')).toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Yellow')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Blue')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Hero')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Sideboard')).not.toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'Tab' });

    await waitFor(() => {
      expect(within(deckScrollRegion).getByText('Filter Blue')).toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Red')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Yellow')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Hero')).not.toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'Tab' });

    await waitFor(() => {
      expect(within(deckScrollRegion).getByText('Filter Yellow')).toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Blue')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Red')).not.toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'Tab' });

    await waitFor(() => {
      expect(within(deckScrollRegion).getByText('Filter Sideboard')).toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Yellow')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Hero')).not.toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'Tab' });

    await waitFor(() => {
      expect(within(deckScrollRegion).getByText('Filter Hero')).toBeInTheDocument();
      expect(within(deckScrollRegion).getByText('Filter Equipment')).toBeInTheDocument();
      expect(within(deckScrollRegion).getByText('Filter Ally')).toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Sideboard')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Red')).not.toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'Tab' });

    await waitFor(() => {
      expect(within(deckScrollRegion).getByText('Filter Hero')).toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Sideboard')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).getByText('Filter Red')).toBeInTheDocument();
      expect(within(deckScrollRegion).getByText('Filter Yellow')).toBeInTheDocument();
      expect(within(deckScrollRegion).getByText('Filter Blue')).toBeInTheDocument();
    });
  });

  it('does not show card loading placeholders when switching between deck filters', async () => {
    installImageMock();
    global.fetch = createAppFetchMock({ cardData: categorizedCards });
    imageQualityMocks.rankPrintingsByResolution.mockClear();

    const appRef = createRef();
    render(<App ref={appRef} />);

    await waitFor(() => {
      expect(appRef.current).toBeTruthy();
    });

    await waitFor(() => {
      expect(appRef.current.state.cards).toEqual(categorizedCards);
    });

    const cardsByName = Object.fromEntries(categorizedCards.map((card) => [card.name, card]));
    appRef.current.setState({
      chosenCards: [
        { card: cardsByName['Filter Hero'], printing: cardsByName['Filter Hero'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Equipment'], printing: cardsByName['Filter Equipment'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Ally'], printing: cardsByName['Filter Ally'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Sideboard'], printing: cardsByName['Filter Sideboard'].printings[0], isSideboard: true },
        { card: cardsByName['Filter Red'], printing: cardsByName['Filter Red'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Yellow'], printing: cardsByName['Filter Yellow'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Blue'], printing: cardsByName['Filter Blue'].printings[0], isSideboard: false },
      ],
    });

    const deckScrollRegion = screen.getByLabelText('Imported cards list');

    await waitFor(() => {
      expect(within(deckScrollRegion).getByText('Filter Hero')).toBeInTheDocument();
      expect(screen.queryByText('Loading...')).toBeNull();
    });

    const initialRankCallCount = imageQualityMocks.rankPrintingsByResolution.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: /Red/ }));

    await waitFor(() => {
      expect(within(deckScrollRegion).getByText('Filter Red')).toBeInTheDocument();
    });

    expect(screen.queryByText('Loading...')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /All/ }));

    await waitFor(() => {
      expect(within(deckScrollRegion).getByText('Filter Hero')).toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Sideboard')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).getByText('Filter Red')).toBeInTheDocument();
      expect(within(deckScrollRegion).getByText('Filter Yellow')).toBeInTheDocument();
      expect(within(deckScrollRegion).getByText('Filter Blue')).toBeInTheDocument();
    });

    expect(screen.queryByText('Loading...')).toBeNull();
    expect(imageQualityMocks.rankPrintingsByResolution).toHaveBeenCalledTimes(initialRankCallCount);
  });

  it('does not switch tabs with number shortcuts while typing in editable fields', async () => {
    installImageMock();
    global.fetch = createAppFetchMock({ cardData: categorizedCards });

    const appRef = createRef();
    render(<App ref={appRef} />);

    await waitFor(() => {
      expect(appRef.current).toBeTruthy();
    });

    const deckListInput = screen.getByPlaceholderText('Paste decklist here...');

    deckListInput.focus();
    fireEvent.keyDown(deckListInput, { key: '2' });
    fireEvent.keyDown(deckListInput, { key: 'Tab' });

    expect(screen.queryByRole('searchbox', { name: 'Archive search' })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Paste decklist here...')).toHaveFocus();

    await waitFor(() => {
      expect(appRef.current.state.cards).toEqual(categorizedCards);
    });

    const cardsByName = Object.fromEntries(categorizedCards.map((card) => [card.name, card]));
    appRef.current.setState({
      chosenCards: [
        { card: cardsByName['Filter Hero'], printing: cardsByName['Filter Hero'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Sideboard'], printing: cardsByName['Filter Sideboard'].printings[0], isSideboard: true },
        { card: cardsByName['Filter Red'], printing: cardsByName['Filter Red'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Yellow'], printing: cardsByName['Filter Yellow'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Blue'], printing: cardsByName['Filter Blue'].printings[0], isSideboard: false },
      ],
    });

    deckListInput.focus();
    fireEvent.keyDown(deckListInput, { key: 'Tab' });

    const deckScrollRegion = screen.getByLabelText('Imported cards list');

    await waitFor(() => {
      expect(within(deckScrollRegion).getByText('Filter Hero')).toBeInTheDocument();
      expect(within(deckScrollRegion).queryByText('Filter Sideboard')).not.toBeInTheDocument();
      expect(within(deckScrollRegion).getByText('Filter Red')).toBeInTheDocument();
      expect(within(deckScrollRegion).getByText('Filter Yellow')).toBeInTheDocument();
      expect(within(deckScrollRegion).getByText('Filter Blue')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Decks' }));

    await waitFor(() => {
      expect(screen.getByRole('searchbox', { name: 'Saved deck search' })).toBeInTheDocument();
    });

    const savedDeckSearch = screen.getByRole('searchbox', { name: 'Saved deck search' });

    savedDeckSearch.focus();
    fireEvent.keyDown(savedDeckSearch, { key: '1' });

    expect(screen.queryByRole('textbox', { name: 'Deck name' })).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Saved deck search' })).toHaveFocus();
  });

  it('moves focus to the clicked selected deck card and intercepts Space to open preview', async () => {
    installImageMock();
    global.fetch = createAppFetchMock({ cardData: categorizedCards });

    const appRef = createRef();
    render(<App ref={appRef} />);

    await waitFor(() => {
      expect(appRef.current).toBeTruthy();
    });

    await waitFor(() => {
      expect(appRef.current.state.cards).toEqual(categorizedCards);
    });

    const cardsByName = Object.fromEntries(categorizedCards.map((card) => [card.name, card]));
    appRef.current.setState({
      chosenCards: [
        { card: cardsByName['Filter Red'], printing: cardsByName['Filter Red'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Yellow'], printing: cardsByName['Filter Yellow'].printings[0], isSideboard: false },
      ],
    });

    const deckScrollRegion = screen.getByLabelText('Imported cards list');
    const selectedCard = await within(deckScrollRegion).findByRole('option', { name: 'Filter Red' });
    const deckMenuButton = screen.getByRole('button', { name: 'More actions' });

    deckMenuButton.focus();
    expect(deckMenuButton).toHaveFocus();
    fireEvent.click(selectedCard);
    expect(selectedCard).toHaveFocus();

    const spaceEvent = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      cancelable: true,
    });
    document.activeElement.dispatchEvent(spaceEvent);
    expect(spaceEvent.defaultPrevented).toBe(true);

    const previewDialog = await screen.findByRole('dialog', { name: 'Card preview' });
    const previewImage = within(previewDialog).getByRole('img', { name: 'Preview of Filter Red' });
    const previewFrame = previewImage.parentElement;
    expect(previewImage).toHaveAttribute(
      'src',
      'https://example.com/red.png'
    );
    expect(previewFrame).toHaveClass('card-preview-card');
    expect(previewImage).toHaveClass('card-preview-image');
    expect(previewImage).toHaveClass('h-full');
    expect(previewImage).toHaveClass('w-full');
    expect(previewImage).toHaveClass('object-contain');
    expect(within(previewDialog).queryByRole('heading', { name: 'Filter Red' })).toBeNull();
    expect(within(previewDialog).queryByRole('button', { name: 'Close card preview' })).toBeNull();
    expect(within(previewDialog).queryByText(/Quick Look/i)).toBeNull();
    expect(within(previewDialog).queryByText(/Press Space or Escape to close/i)).toBeNull();
    expect(document.querySelector('.card-preview-backdrop')).toHaveClass('card-preview-backdrop--blurred');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.getByRole('dialog', { name: 'Card preview' })).toHaveAttribute('data-preview-state', 'closing');

    await new Promise((resolve) => setTimeout(resolve, 340));
    expect(screen.queryByRole('dialog', { name: 'Card preview' })).toBeNull();
  });

  it('moves focus to the clicked archive row and intercepts Space to open preview', async () => {
    installImageMock();
    global.fetch = createAppFetchMock({ cardData: categorizedCards });

    const appRef = createRef();
    render(<App ref={appRef} />);

    await waitFor(() => {
      expect(appRef.current).toBeTruthy();
    });

    await waitFor(() => {
      expect(appRef.current.state.cards).toEqual(categorizedCards);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    const archiveSearch = await screen.findByRole('searchbox', { name: 'Archive search' });
    archiveSearch.focus();
    expect(archiveSearch).toHaveFocus();

    fireEvent.input(archiveSearch, {
      target: { value: 'Filter' },
    });

    const archiveRow = await screen.findByLabelText('Archive card Filter Red');

    fireEvent.click(archiveRow);
    expect(archiveRow).toHaveFocus();

    const spaceEvent = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      cancelable: true,
    });
    document.activeElement.dispatchEvent(spaceEvent);
    expect(spaceEvent.defaultPrevented).toBe(true);

    const previewDialog = await screen.findByRole('dialog', { name: 'Card preview' });
    const previewImage = within(previewDialog).getByRole('img', { name: 'Preview of Filter Red' });
    expect(previewImage).toHaveAttribute('src', 'https://example.com/red.png');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.getByRole('dialog', { name: 'Card preview' })).toHaveAttribute('data-preview-state', 'closing');

    await new Promise((resolve) => setTimeout(resolve, 340));
    expect(screen.queryByRole('dialog', { name: 'Card preview' })).toBeNull();
  });

  it('switches archive previews with ArrowUp and ArrowDown while the preview is open', async () => {
    installImageMock();
    global.fetch = createAppFetchMock({ cardData: categorizedCards });

    const appRef = createRef();
    render(<App ref={appRef} />);

    await waitFor(() => {
      expect(appRef.current).toBeTruthy();
    });

    await waitFor(() => {
      expect(appRef.current.state.cards).toEqual(categorizedCards);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    const archiveSearch = await screen.findByRole('searchbox', { name: 'Archive search' });
    fireEvent.input(archiveSearch, {
      target: { value: 'Filter' },
    });

    const yellowArchiveRow = await screen.findByLabelText('Archive card Filter Yellow');
    fireEvent.click(yellowArchiveRow);
    expect(yellowArchiveRow).toHaveFocus();

    fireEvent.keyDown(document.activeElement, { key: ' ', code: 'Space' });

    expect(await screen.findByRole('img', { name: 'Preview of Filter Yellow' })).toHaveAttribute('src', 'https://example.com/yellow.png');

    const arrowDownEvent = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      code: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    document.activeElement.dispatchEvent(arrowDownEvent);
    expect(arrowDownEvent.defaultPrevented).toBe(true);

    const blueArchiveRow = await screen.findByLabelText('Archive card Filter Blue');
    await waitFor(() => {
      expect(blueArchiveRow).toHaveFocus();
    });
    expect(screen.getByRole('img', { name: 'Preview of Filter Blue' })).toHaveAttribute('src', 'https://example.com/blue.png');

    fireEvent.keyDown(document.activeElement, { key: 'ArrowUp', code: 'ArrowUp' });

    await waitFor(() => {
      expect(yellowArchiveRow).toHaveFocus();
    });
    expect(screen.getByRole('img', { name: 'Preview of Filter Yellow' })).toHaveAttribute('src', 'https://example.com/yellow.png');
  });

  it('switches deck previews with all arrow keys based on the visible card grid', async () => {
    installImageMock();
    global.fetch = createAppFetchMock({ cardData: categorizedCards });

    const appRef = createRef();
    render(<App ref={appRef} />);

    await waitFor(() => {
      expect(appRef.current).toBeTruthy();
    });

    await waitFor(() => {
      expect(appRef.current.state.cards).toEqual(categorizedCards);
    });

    const cardsByName = Object.fromEntries(categorizedCards.map((card) => [card.name, card]));
    appRef.current.setState({
      chosenCards: [
        { card: cardsByName['Filter Hero'], printing: cardsByName['Filter Hero'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Equipment'], printing: cardsByName['Filter Equipment'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Ally'], printing: cardsByName['Filter Ally'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Red'], printing: cardsByName['Filter Red'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Yellow'], printing: cardsByName['Filter Yellow'].printings[0], isSideboard: false },
        { card: cardsByName['Filter Blue'], printing: cardsByName['Filter Blue'].printings[0], isSideboard: false },
      ],
    });

    const deckScrollRegion = screen.getByLabelText('Imported cards list');
    const deckCards = {
      hero: await within(deckScrollRegion).findByRole('option', { name: 'Filter Hero' }),
      equipment: await within(deckScrollRegion).findByRole('option', { name: 'Filter Equipment' }),
      ally: await within(deckScrollRegion).findByRole('option', { name: 'Filter Ally' }),
      red: await within(deckScrollRegion).findByRole('option', { name: 'Filter Red' }),
      yellow: await within(deckScrollRegion).findByRole('option', { name: 'Filter Yellow' }),
      blue: await within(deckScrollRegion).findByRole('option', { name: 'Filter Blue' }),
    };

    mockElementRect(deckCards.hero, { left: 20, top: 20 });
    mockElementRect(deckCards.equipment, { left: 280, top: 20 });
    mockElementRect(deckCards.ally, { left: 540, top: 20 });
    mockElementRect(deckCards.red, { left: 20, top: 380 });
    mockElementRect(deckCards.yellow, { left: 280, top: 380 });
    mockElementRect(deckCards.blue, { left: 540, top: 380 });

    fireEvent.click(deckCards.yellow);
    expect(deckCards.yellow).toHaveFocus();

    fireEvent.keyDown(document.activeElement, { key: ' ', code: 'Space' });
    expect(await screen.findByRole('img', { name: 'Preview of Filter Yellow' })).toHaveAttribute('src', 'https://example.com/yellow.png');

    const arrowUpEvent = new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      code: 'ArrowUp',
      bubbles: true,
      cancelable: true,
    });
    document.activeElement.dispatchEvent(arrowUpEvent);
    expect(arrowUpEvent.defaultPrevented).toBe(true);

    await waitFor(() => {
      expect(appRef.current.state.previewedDeckEntryIndex).toBe(1);
      expect(within(deckScrollRegion).getByRole('option', { name: 'Filter Equipment' })).toHaveFocus();
    });
    expect(screen.getByRole('img', { name: 'Preview of Filter Equipment' })).toHaveAttribute('src', 'https://example.com/gear.png');

    fireEvent.keyDown(document.activeElement, { key: 'ArrowRight', code: 'ArrowRight' });
    await waitFor(() => {
      expect(appRef.current.state.previewedDeckEntryIndex).toBe(2);
      expect(within(deckScrollRegion).getByRole('option', { name: 'Filter Ally' })).toHaveFocus();
    });
    expect(screen.getByRole('img', { name: 'Preview of Filter Ally' })).toHaveAttribute('src', 'https://example.com/ally.png');

    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown', code: 'ArrowDown' });
    await waitFor(() => {
      expect(appRef.current.state.previewedDeckEntryIndex).toBe(5);
      expect(within(deckScrollRegion).getByRole('option', { name: 'Filter Blue' })).toHaveFocus();
    });
    expect(screen.getByRole('img', { name: 'Preview of Filter Blue' })).toHaveAttribute('src', 'https://example.com/blue.png');

    fireEvent.keyDown(document.activeElement, { key: 'ArrowLeft', code: 'ArrowLeft' });
    await waitFor(() => {
      expect(appRef.current.state.previewedDeckEntryIndex).toBe(4);
      expect(within(deckScrollRegion).getByRole('option', { name: 'Filter Yellow' })).toHaveFocus();
    });
    expect(screen.getByRole('img', { name: 'Preview of Filter Yellow' })).toHaveAttribute('src', 'https://example.com/yellow.png');
  });
});
