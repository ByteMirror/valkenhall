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

mock.module('./utils/chartRuntime', () => ({
  getInteractiveChartsAvailability: vi.fn(() => ({ enabled: true, reason: null })),
  shouldRenderInteractiveCharts: vi.fn(() => true),
}));

const { default: App } = await import('./app.jsx');

const sampleCards = [
  {
    unique_id: 'card-1',
    name: 'Command and Conquer',
    pitch: '1',
    cost: '2',
    power: '6',
    defense: '3',
    types: ['Generic', 'Attack Action'],
    played_horizontally: false,
    functional_text_plain: 'Go again',
    printings: [
      {
        unique_id: 'printing-1',
        image_url: 'https://example.com/card-1.png',
        image_rotation_degrees: 0,
        rarity: 'M',
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

  Object.defineProperty(window, 'ResizeObserver', {
    configurable: true,
    value: class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
}

function installWindowMocksWithoutResizeObserver() {
  installWindowMocks();

  Object.defineProperty(window, 'ResizeObserver', {
    configurable: true,
    value: undefined,
  });
}

function createDesktopFetchMock() {
  return vi.fn(async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || 'GET').toUpperCase();

    if (url === 'http://127.0.0.1:3001/api/cards' || url.includes('/cards.json')) {
      return createJsonResponse(sampleCards);
    }

    if (url.startsWith('http://127.0.0.1:3001/api/decks') && !url.includes('/api/decks/') && method === 'GET') {
      return createJsonResponse([]);
    }

    throw new Error(`Unhandled fetch request: ${method} ${url}`);
  });
}

describe('desktop Bun charts', () => {
  it('renders live metrics charts when chart rendering is enabled', async () => {
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
      expect(screen.queryByText('Chart rendering is unavailable in this environment. Metric filter controls remain available below.')).toBeNull();
      expect(screen.getByText('Types')).toBeInTheDocument();
      expect(screen.getByText('Costs')).toBeInTheDocument();
    });
  });

  it('renders live metrics charts when ResizeObserver is unavailable in the desktop runtime', async () => {
    installWindowMocksWithoutResizeObserver();
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
      expect(screen.queryByText('Chart rendering is unavailable in this environment. Metric filter controls remain available below.')).toBeNull();
      expect(screen.getByText('Types')).toBeInTheDocument();
      expect(screen.getByText('Costs')).toBeInTheDocument();
    });
  });
});
