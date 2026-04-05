import { describe, expect, it } from 'bun:test';
import { detectDeckFormatFromImportText, detectImportInputMode, parseImportText } from '../utils/importInput';

// Test the text parsing logic used in importFromFabraryText
describe('Import Text Parser', () => {
  describe('Basic card parsing', () => {
    it('should parse simple card list', () => {
      const input = `3x Command and Conquer
2x Infect
1x Arakni`;

      const result = parseImportText(input);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ count: 3, name: 'Command and Conquer', pitch: '' });
      expect(result[1]).toEqual({ count: 2, name: 'Infect', pitch: '' });
      expect(result[2]).toEqual({ count: 1, name: 'Arakni', pitch: '' });
    });

    it('should handle varying whitespace', () => {
      const input = `  3x   Card Name
1x Another Card
  2x  Third Card  `;

      const result = parseImportText(input);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Card Name');
      expect(result[1].name).toBe('Another Card');
      expect(result[2].name).toBe('Third Card');
    });

    it('should filter empty lines', () => {
      const input = `3x Card One

2x Card Two


1x Card Three`;

      const result = parseImportText(input);

      expect(result).toHaveLength(3);
    });
  });

  describe('Pitch value parsing', () => {
    it('should parse red pitch cards', () => {
      const input = '3x Command and Conquer (red)';
      const result = parseImportText(input);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        count: 3,
        name: 'Command and Conquer',
        pitch: 'red'
      });
    });

    it('should parse yellow pitch cards', () => {
      const input = '2x Sink Below (yellow)';
      const result = parseImportText(input);

      expect(result[0].pitch).toBe('yellow');
    });

    it('should parse blue pitch cards', () => {
      const input = '1x Art of War (blue)';
      const result = parseImportText(input);

      expect(result[0].pitch).toBe('blue');
    });

    it('should handle mixed pitch and non-pitch cards', () => {
      const input = `3x Command and Conquer (red)
2x Infect
1x Sink Below (blue)`;

      const result = parseImportText(input);

      expect(result).toHaveLength(3);
      expect(result[0].pitch).toBe('red');
      expect(result[1].pitch).toBe('');
      expect(result[2].pitch).toBe('blue');
    });
  });

  describe('Hero card handling', () => {
    it('should convert "Hero:" prefix to "1x"', () => {
      const input = 'Hero: Arakni';
      const result = parseImportText(input);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ count: 1, name: 'Arakni', pitch: '' });
    });

    it('should handle case-insensitive "Hero:" prefix', () => {
      const input = 'HERO: Arakni';
      const result = parseImportText(input);

      expect(result).toHaveLength(1);
      expect(result[0].count).toBe(1);
    });
  });

  describe('Card name formats', () => {
    it('should parse cards with special characters', () => {
      const input = `1x Arakni, 5L!p3d 7hRu 7h3 cR4X
3x Art of Desire: Body`;

      const result = parseImportText(input);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Arakni, 5L!p3d 7hRu 7h3 cR4X');
      expect(result[1].name).toBe('Art of Desire: Body');
    });

    it('should handle accented characters', () => {
      const input = '2x Café Olé';
      const result = parseImportText(input);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Cafe Ole'); // Normalized
    });

    it('should handle apostrophes and hyphens', () => {
      const input = `1x Hunter's Klaive
2x Mother-of-Pearl`;

      const result = parseImportText(input);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Hunter's Klaive");
      expect(result[1].name).toBe('Mother-of-Pearl');
    });
  });

  describe('Token cards', () => {
    it('should parse token cards like regular cards', () => {
      const input = `1x Bloodrot Pox
1x Frailty
1x Marked
1x Ponder
1x Silver`;

      const result = parseImportText(input);

      expect(result).toHaveLength(5);
      expect(result[0].name).toBe('Bloodrot Pox');
      expect(result[1].name).toBe('Frailty');
      expect(result[4].name).toBe('Silver');
    });
  });

  describe('Full deck list parsing', () => {
    it('should parse a complete deck with hero, main deck, and tokens', () => {
      const input = `Hero: Arakni
3x Command and Conquer (red)
3x Infect (red)
2x Sink Below (blue)
1x Bloodrot Pox
1x Frailty`;

      const result = parseImportText(input);

      expect(result).toHaveLength(6);
      expect(result[0]).toEqual({ count: 1, name: 'Arakni', pitch: '' });
      expect(result[1]).toEqual({ count: 3, name: 'Command and Conquer', pitch: 'red' });
      expect(result[4]).toEqual({ count: 1, name: 'Bloodrot Pox', pitch: '' });
      expect(result[5]).toEqual({ count: 1, name: 'Frailty', pitch: '' });
    });
  });

  describe('Invalid input handling', () => {
    it('should skip lines that do not match the pattern', () => {
      const input = `3x Valid Card
This is not a valid line
Another invalid line
2x Another Valid Card`;

      const result = parseImportText(input);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Valid Card');
      expect(result[1].name).toBe('Another Valid Card');
    });

    it('should handle count numbers from 1-99', () => {
      const input = `1x Card One
10x Card Ten
99x Card NinetyNine`;

      const result = parseImportText(input);

      expect(result).toHaveLength(3);
      expect(result[0].count).toBe(1);
      expect(result[1].count).toBe(10);
      expect(result[2].count).toBe(99);
    });

    it('should return empty array for completely invalid input', () => {
      const input = `Not a deck list
Just some random text
Nothing matches here`;

      const result = parseImportText(input);

      expect(result).toHaveLength(0);
    });
  });

  describe('Windows line endings', () => {
    it('should handle CRLF line endings', () => {
      const input = '3x Card One\r\n2x Card Two\r\n1x Card Three';
      const result = parseImportText(input);

      expect(result).toHaveLength(3);
    });
  });

  describe('Import mode detection', () => {
    it('prefers deck-text parsing for valid list content', () => {
      const input = `Hero: Arakni
3x Command and Conquer (red)
2x Infect`;

      expect(detectImportInputMode(input)).toBe('text');
    });

    it('does not treat multiline input containing a Fabrary URL as URL mode', () => {
      const input = `https://fabrary.net/decks/01KJPB5WKCP2X7TV75WF9D8S8T
3x Command and Conquer
2x Infect`;

      expect(detectImportInputMode(input)).toBe('text');
    });

    it('only uses URL mode for a standalone Fabrary deck URL', () => {
      const input = 'https://fabrary.net/decks/01KJPB5WKCP2X7TV75WF9D8S8T';

      expect(detectImportInputMode(input)).toBe('url');
    });
  });

  describe('Deck format detection', () => {
    it('detects classic constructed from import metadata', () => {
      const input = `Name: Bravo Midrange
Format: Classic Constructed
Hero: Bravo, Showstopper
3x Command and Conquer`;

      expect(detectDeckFormatFromImportText(input)).toBe('classic-constructed');
    });

    it('detects silver age from import metadata', () => {
      const input = `Name: Arakni Tempo
Format: Silver Age
Hero: Arakni
3x Infect`;

      expect(detectDeckFormatFromImportText(input)).toBe('silver-age');
    });

    it('returns empty format when import metadata does not specify a supported format', () => {
      const input = `Name: Dash IO
Hero: Dash I/O
3x Zero to Sixty`;

      expect(detectDeckFormatFromImportText(input)).toBe('');
    });
  });
});
