import { afterEach, beforeEach, vi } from 'bun:test';
const { cleanup } = await import('@testing-library/preact');
await import('@testing-library/jest-dom');

function createStorageMock() {
  const store = new Map();

  return {
    getItem: vi.fn((key) => (store.has(String(key)) ? store.get(String(key)) : null)),
    setItem: vi.fn((key, value) => {
      store.set(String(key), String(value));
    }),
    removeItem: vi.fn((key) => {
      store.delete(String(key));
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    key: vi.fn((index) => Array.from(store.keys())[index] ?? null),
    get length() {
      return store.size;
    },
  };
}

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();

  const storage = createStorageMock();

  global.fetch = vi.fn();

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });

  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storage,
    });
  }
});

afterEach(() => {
  cleanup();
});
