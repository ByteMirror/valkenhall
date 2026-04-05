import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { isFabraryUrl, extractDeckId, fetchFabraryDeck, importFromFabraryUrl } from './fabraryImport';

describe('fabraryImport', () => {
  describe('isFabraryUrl', () => {
    it('should return true for valid Fabrary deck URLs', () => {
      expect(isFabraryUrl('https://fabrary.net/decks/01JZKY6BKF3NJXJFXG7G465700')).toBe(true);
      expect(isFabraryUrl('http://fabrary.net/decks/ABC123DEF456')).toBe(true);
      expect(isFabraryUrl('fabrary.net/decks/XYZ789')).toBe(true);
    });

    it('should return false for invalid URLs', () => {
      expect(isFabraryUrl('https://google.com')).toBe(false);
      expect(isFabraryUrl('https://fabrary.net/cards')).toBe(false);
      expect(isFabraryUrl('not a url')).toBe(false);
      expect(isFabraryUrl('')).toBe(false);
    });
  });

  describe('extractDeckId', () => {
    it('should extract deck ID from valid URLs', () => {
      expect(extractDeckId('https://fabrary.net/decks/01JZKY6BKF3NJXJFXG7G465700'))
        .toBe('01JZKY6BKF3NJXJFXG7G465700');
      expect(extractDeckId('http://fabrary.net/decks/ABC123')).toBe('ABC123');
      expect(extractDeckId('fabrary.net/decks/XYZ789')).toBe('XYZ789');
    });

    it('should return null for invalid URLs', () => {
      expect(extractDeckId('https://google.com')).toBe(null);
      expect(extractDeckId('https://fabrary.net/cards')).toBe(null);
      expect(extractDeckId('')).toBe(null);
    });

    it('should handle case-insensitive URLs', () => {
      expect(extractDeckId('https://FABRARY.NET/DECKS/ABC123')).toBe('ABC123');
    });
  });

  describe('fetchFabraryDeck', () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    it('should fetch and parse deck successfully', async () => {
      const mockHtml = `
        <html>
          <body>
            <img alt="Arakni" />
            <img alt="Arakni" />
            <img alt="Command and Conquer" />
            <img alt="Command and Conquer" />
            <img alt="Command and Conquer" />
            <img alt="Bloodrot Pox" />
            <img alt="Frailty" />
            <img alt="Loading" />
            <img alt="NitroPay" />
          </body>
        </html>
      `;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockHtml,
      });

      const result = await fetchFabraryDeck('TEST123');

      expect(result).toContain('2x Arakni');
      expect(result).toContain('3x Command and Conquer');
      expect(result).toContain('1x Bloodrot Pox');
      expect(result).toContain('1x Frailty');
      expect(result).not.toContain('Loading');
      expect(result).not.toContain('NitroPay');
    });

    it('should try multiple proxies on failure', async () => {
      const validHtml = '<html><body>' + '<img alt="Test Card" />'.repeat(10) + '</body></html>';

      global.fetch
        .mockRejectedValueOnce(new Error('Proxy 1 failed'))
        .mockRejectedValueOnce(new Error('Proxy 2 failed'))
        .mockResolvedValueOnce({
          ok: true,
          text: async () => validHtml,
        });

      const result = await fetchFabraryDeck('TEST123');

      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(result).toContain('10x Test Card');
    });

    it('should throw error when all proxies fail', async () => {
      global.fetch
        .mockRejectedValueOnce(new Error('Proxy 1 failed'))
        .mockRejectedValueOnce(new Error('Proxy 2 failed'))
        .mockRejectedValueOnce(new Error('Proxy 3 failed'));

      await expect(fetchFabraryDeck('TEST123')).rejects.toThrow(
        'All CORS proxies failed'
      );
    });

    it('should handle HTTP errors', async () => {
      const validHtml = '<html><body>' + '<img alt="Card" />'.repeat(10) + '</body></html>';

      global.fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => validHtml,
        });

      const result = await fetchFabraryDeck('TEST123');
      expect(result).toContain('10x Card');
    });

    it('should filter out invalid card names', async () => {
      const mockHtml = `
        <html>
          <body>
            <img alt="Valid Card Name" />
            <img alt="" />
            <img alt="L" />
            <img alt="${'x'.repeat(150)}" />
            <img alt="Language Picker English" />
            <img alt="Close Language Picker" />
          </body>
        </html>
      `;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockHtml,
      });

      const result = await fetchFabraryDeck('TEST123');

      expect(result).toContain('1x Valid Card Name');
      expect(result).not.toContain('Language Picker');
      expect(result.split('\n').length).toBe(1);
    });

    it('should count duplicate cards correctly', async () => {
      const mockHtml = `
        <html>
          <body>
            <img alt="Card A" />
            <img alt="Card B" />
            <img alt="Card A" />
            <img alt="Card C" />
            <img alt="Card A" />
            <img alt="Card B" />
          </body>
        </html>
      `;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockHtml,
      });

      const result = await fetchFabraryDeck('TEST123');

      expect(result).toContain('3x Card A');
      expect(result).toContain('2x Card B');
      expect(result).toContain('1x Card C');
    });
  });

  describe('importFromFabraryUrl', () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    it('should extract deck ID and fetch deck', async () => {
      const validHtml = '<html><body>' + '<img alt="Test Card" />'.repeat(10) + '</body></html>';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => validHtml,
      });

      const result = await importFromFabraryUrl('https://fabrary.net/decks/ABC123');

      expect(result).toContain('10x Test Card');
    });

    it('should throw error for invalid URL', async () => {
      await expect(importFromFabraryUrl('https://invalid.com')).rejects.toThrow(
        'Invalid Fabrary URL'
      );
    });
  });
});
