import { describe, expect, it } from 'bun:test';
import {
  parseSorceryImportText,
  isStandaloneCuriosaDeckUrl,
  extractCuriosaDeckId,
} from '../utils/sorcery/importInput';

describe('Sorcery Import Text Parser', () => {
  describe('Basic card parsing', () => {
    it('should parse simple card list', () => {
      const input = `2x Adept Illusionist
3x Volcanic Island
1x Lightning Bolt`;
      const result = parseSorceryImportText(input);
      expect(result.cards).toHaveLength(3);
      expect(result.cards[0]).toEqual({ count: 2, name: 'Adept Illusionist', zone: '' });
      expect(result.cards[1]).toEqual({ count: 3, name: 'Volcanic Island', zone: '' });
      expect(result.cards[2]).toEqual({ count: 1, name: 'Lightning Bolt', zone: '' });
    });

    it('should parse Avatar: prefix', () => {
      const input = 'Avatar: Sorcerer';
      const result = parseSorceryImportText(input);
      expect(result.avatar).toBe('Sorcerer');
      expect(result.cards).toHaveLength(0);
    });
  });

  describe('Section headers', () => {
    it('should assign cards to zones based on section headers', () => {
      const input = `Avatar: Sorcerer
Spellbook:
2x Adept Illusionist
Atlas:
3x Volcanic Island
Collection:
1x Reserve Card`;
      const result = parseSorceryImportText(input);
      expect(result.avatar).toBe('Sorcerer');
      expect(result.cards[0]).toEqual({ count: 2, name: 'Adept Illusionist', zone: 'spellbook' });
      expect(result.cards[1]).toEqual({ count: 3, name: 'Volcanic Island', zone: 'atlas' });
      expect(result.cards[2]).toEqual({ count: 1, name: 'Reserve Card', zone: 'collection' });
    });

    it('should default zone to empty when no section header', () => {
      const input = `2x Card One\n3x Card Two`;
      const result = parseSorceryImportText(input);
      expect(result.cards[0].zone).toBe('');
      expect(result.cards[1].zone).toBe('');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty input', () => {
      expect(parseSorceryImportText('').cards).toHaveLength(0);
    });
    it('should handle CRLF line endings', () => {
      const input = '2x Card One\r\n3x Card Two';
      expect(parseSorceryImportText(input).cards).toHaveLength(2);
    });
    it('should skip invalid lines', () => {
      const input = `2x Valid Card\nNot a valid line\n3x Another Valid`;
      expect(parseSorceryImportText(input).cards).toHaveLength(2);
    });
  });
});

describe('Curiosa URL Detection', () => {
  it('should detect a valid Curiosa deck URL', () => {
    expect(isStandaloneCuriosaDeckUrl('https://curiosa.io/decks/cmmgcayha00eb04l1e0iiolbi')).toBe(true);
  });
  it('should reject non-Curiosa URLs', () => {
    expect(isStandaloneCuriosaDeckUrl('https://fabrary.net/decks/ABC123')).toBe(false);
  });
  it('should reject Curiosa URLs that are not deck URLs', () => {
    expect(isStandaloneCuriosaDeckUrl('https://curiosa.io/cards')).toBe(false);
  });
  it('should extract deck ID from URL', () => {
    expect(extractCuriosaDeckId('https://curiosa.io/decks/cmmgcayha00eb04l1e0iiolbi')).toBe('cmmgcayha00eb04l1e0iiolbi');
  });
  it('should return null for invalid URL', () => {
    expect(extractCuriosaDeckId('https://google.com')).toBe(null);
  });
});
