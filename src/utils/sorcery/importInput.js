export function parseSorceryImportText(text) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  let avatar = '';
  let currentZone = '';
  const cards = [];

  const cardLineRegex = /^\s*(\d{1,3})\s*x\s+(.+?)\s*$/i;
  const sectionHeaderRegex = /^(spellbook|atlas|collection)\s*:?\s*$/i;
  const avatarRegex = /^avatar\s*:\s*(.+)$/i;

  for (const line of lines) {
    const avatarMatch = avatarRegex.exec(line);
    if (avatarMatch) {
      avatar = avatarMatch[1].trim();
      continue;
    }

    const sectionMatch = sectionHeaderRegex.exec(line);
    if (sectionMatch) {
      currentZone = sectionMatch[1].toLowerCase();
      continue;
    }

    const cardMatch = cardLineRegex.exec(line);
    if (cardMatch) {
      cards.push({
        count: parseInt(cardMatch[1], 10),
        name: cardMatch[2].trim(),
        zone: currentZone,
      });
    }
  }

  return { avatar, cards };
}

export function isStandaloneCuriosaDeckUrl(text) {
  return /^https?:\/\/(?:www\.)?curiosa\.io\/decks\/[a-z0-9]+\/?$/i.test(String(text || '').trim());
}

export function extractCuriosaDeckId(url) {
  const match = String(url || '').match(/curiosa\.io\/decks\/([a-z0-9]+)/i);
  return match ? match[1] : null;
}
