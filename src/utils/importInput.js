export function normalizeDeckFormat(value) {
  const normalizedValue = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  if (normalizedValue === 'classic constructed') {
    return 'classic-constructed';
  }

  if (normalizedValue === 'silver age') {
    return 'silver-age';
  }

  return '';
}

export function detectDeckFormatFromImportText(text) {
  const formatLine = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^format\s*:/i.test(line));

  if (!formatLine) {
    return '';
  }

  return normalizeDeckFormat(formatLine.replace(/^format\s*:/i, ''));
}

export function parseImportText(text) {
  const lines = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^Hero:\s*/i, '1x '));

  const lineRegex = /^\s*(\d{1,2})\s*x\s+([^\(]*?)(?:\s*\((red|yellow|blue)\))?\s*$/i;

  return lines
    .map((line) => lineRegex.exec(line))
    .filter(Boolean)
    .map((match) => ({
      count: parseInt(match[1], 10),
      name: match[2].trim(),
      pitch: (match[3] || '').toLowerCase(),
    }));
}

export function isStandaloneFabraryDeckUrl(text) {
  return /^https?:\/\/(?:www\.)?fabrary\.net\/decks\/[A-Z0-9]+\/?$/i.test(text.trim());
}

export function isStandaloneCuriosaDeckUrl(text) {
  return /^https?:\/\/(?:www\.)?curiosa\.io\/decks\/[a-z0-9]+\/?$/i.test(text.trim());
}

export function detectImportInputMode(text, game = 'fab') {
  const trimmed = text.trim();

  if (!trimmed) {
    return 'empty';
  }

  if (parseImportText(trimmed).length > 0) {
    return 'text';
  }

  if (game === 'fab' && isStandaloneFabraryDeckUrl(trimmed)) {
    return 'url';
  }

  if (game === 'sorcery' && isStandaloneCuriosaDeckUrl(trimmed)) {
    return 'url';
  }

  return 'text';
}
