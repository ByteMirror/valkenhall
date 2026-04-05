import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { describe, expect, it, mock, vi } from 'bun:test';
import * as actualImageQuality from './utils/imageQuality';

mock.module('./utils/upscaylApi', () => ({
  upscaleImageUrl: vi.fn(async () => ({ blob: new Blob(['upscaled'], { type: 'image/png' }), cacheUrl: '/api/upscale/cached/abc123.webp' })),
  blobToObjectUrl: vi.fn(() => 'blob:upscaled-card'),
  blobToDataUrl: vi.fn(async () => 'data:image/png;base64,dXBzY2FsZWQ='),
}));

mock.module('./utils/imageQuality', () => ({
  ...actualImageQuality,
  measureImageDimensions: vi.fn(async () => ({ width: 400, height: 560, pixels: 224000 })),
  rankPrintingsByResolution: vi.fn(async (card) =>
    (card?.printings || []).map((printing) => ({
      printing,
      width: 400,
      height: 560,
      pixels: 224000,
    }))
  ),
  selectPrintingNewestMeeting300: vi.fn(async (card) => card?.printings?.[0] || null),
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

function createJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function installWindowMocks() {
  class MockImage {
    set src(_value) {
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

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

function createDesktopFetchMock({ savedDeckSummaries = [], deckRecords = [] } = {}) {
  const decksById = new Map(deckRecords.map((deck) => [deck.id, JSON.parse(JSON.stringify(deck))]));

  return vi.fn(async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || 'GET').toUpperCase();

    if (url === 'http://127.0.0.1:3001/api/cards') {
      return createJsonResponse(sampleCards);
    }

    if (url.startsWith('http://127.0.0.1:3001/api/decks') && !url.includes('/api/decks/') && method === 'GET') {
      return createJsonResponse(savedDeckSummaries);
    }

    const deckMatch = url.match(/^http:\/\/127\.0\.0\.1:3001\/api\/decks\/([^/?]+)(?:\?.*)?$/);
    if (deckMatch && method === 'GET') {
      const deckId = decodeURIComponent(deckMatch[1]);
      const record = decksById.get(deckId);
      return record ? createJsonResponse(record) : createJsonResponse({ error: 'Deck not found' }, 404);
    }

    throw new Error(`Unhandled fetch request: ${method} ${url}`);
  });
}

describe('desktop Bun regressions', () => {
  it('applies responsive shell sizing variables for wide desktop viewports', async () => {
    installWindowMocks();
    const previousInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 2560,
    });
    global.fetch = createDesktopFetchMock();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste decklist here...')).toBeInTheDocument();
    });

    const appShell = document.querySelector('.app-shell');
    const workspaceGrid = document.querySelector('.workspace-grid');
    expect(appShell).not.toBeNull();
    expect(workspaceGrid).not.toBeNull();
    expect(appShell.style.getPropertyValue('--shell-width')).not.toBe('');
    expect(appShell.style.getPropertyValue('--workspace-gap')).not.toBe('');
    expect(appShell.style.getPropertyValue('--card-min-width')).not.toBe('');
    expect(Number.parseFloat(appShell.style.getPropertyValue('--desktop-scale'))).toBeGreaterThan(1);
    expect(workspaceGrid.style.gridTemplateColumns).toContain('minmax(440px,');
    expect(workspaceGrid.style.gridTemplateColumns).toContain('minmax(0, 1fr)');

    window.innerWidth = previousInnerWidth;
  });

  it('imports cards when the desktop shell provides cards through the local api', async () => {
    installWindowMocks();
    global.fetch = createDesktopFetchMock();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste decklist here...')).toBeInTheDocument();
    });

    fireEvent.input(screen.getByPlaceholderText('Paste decklist here...'), {
      target: { value: '1x Command and Conquer' },
    });

    const leftFooter = document.querySelector('.left-pane-footer');
    expect(leftFooter).not.toBeNull();

    await waitFor(() => {
      expect(within(leftFooter).getByRole('button', { name: 'Import' })).toBeEnabled();
    });

    fireEvent.click(within(leftFooter).getByRole('button', { name: 'Import' }));

    await waitFor(() => {
      const saveDeckButton = Array.from(document.querySelectorAll('button[aria-label="Save deck"]')).find(
        (button) => !button.disabled
      );
      expect(saveDeckButton).toBeDefined();
    });
  });

  it('switches back to the import panel after loading a saved deck', async () => {
    installWindowMocks();
    global.fetch = createDesktopFetchMock({
      savedDeckSummaries: [
        {
          id: 'deck-preview',
          name: 'Preview Deck',
          savedAt: '2026-03-08T10:00:00.000Z',
          cardCount: 1,
          previewUrl: 'http://127.0.0.1:3001/api/decks/deck-preview/preview?v=2026-03-08T10%3A00%3A00.000Z',
        },
      ],
      deckRecords: [
        {
          id: 'deck-preview',
          name: 'Preview Deck',
          savedAt: '2026-03-08T10:00:00.000Z',
          format: 'classic-constructed',
          cards: [
            {
              cardId: 'card-1',
              cardName: 'Command and Conquer',
              printingId: 'printing-1',
            },
          ],
        },
      ],
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Decks' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Decks' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load deck Preview Deck' }));

    await waitFor(() => {
      expect(document.querySelector('#deck-list-input')).not.toBeNull();
    });

    const leftFooter = document.querySelector('.left-pane-footer');
    expect(leftFooter).not.toBeNull();
    expect(within(leftFooter).getByRole('button', { name: 'Import' })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox', { name: 'Saved deck search' })).toBeNull();
  });

  it('opens the metrics tab for an imported deck in the Bun desktop renderer', async () => {
    installWindowMocks();
    global.fetch = createDesktopFetchMock();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste decklist here...')).toBeInTheDocument();
    });

    fireEvent.input(screen.getByPlaceholderText('Paste decklist here...'), {
      target: { value: '1x Command and Conquer' },
    });

    const leftFooter = document.querySelector('.left-pane-footer');
    expect(leftFooter).not.toBeNull();

    await waitFor(() => {
      expect(within(leftFooter).getByRole('button', { name: 'Import' })).toBeEnabled();
    });

    fireEvent.click(within(leftFooter).getByRole('button', { name: 'Import' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Metrics' })).toBeInTheDocument();
      const saveDeckButton = Array.from(document.querySelectorAll('button[aria-label="Save deck"]')).find(
        (button) => !button.disabled
      );
      expect(saveDeckButton).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Metrics' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Deck metrics' })).toBeInTheDocument();
      expect(screen.getAllByText('Chart rendering is unavailable in this environment. Metric filter controls remain available below.').length).toBeGreaterThan(0);
    });
  });
});
