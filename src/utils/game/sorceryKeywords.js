import glossary from './codexGlossary.json';

const glossaryLookup = new Map();
const keywordAbilities = new Map();

for (const [key, value] of Object.entries(glossary)) {
  const lower = key.toLowerCase();
  glossaryLookup.set(lower, { keyword: key, description: value });

  if (value.startsWith('Keyword ability') || value.startsWith('Keyword Ability')) {
    const cleanDesc = value.replace(/^Keyword [Aa]bility\.\s*/, '');
    keywordAbilities.set(lower, { keyword: key, description: cleanDesc });
  }
}

export function extractKeywordAbilities(rulesText) {
  if (!rulesText) return [];

  const found = [];
  const seen = new Set();
  const lines = rulesText.replace(/\r\n/g, '\n').split('\n');

  for (const line of lines) {
    const words = line.match(/\b[A-Z][a-z]+(?:\s\+?\d+)?(?:\s+[A-Z][a-z]+)*\b/g) || [];
    for (const word of words) {
      const key = word.toLowerCase();
      if (seen.has(key)) continue;
      const entry = keywordAbilities.get(key);
      if (entry) {
        seen.add(key);
        found.push(entry);
      }
    }
  }

  return found;
}

export function getGlossaryEntry(term) {
  return glossaryLookup.get(term.toLowerCase()) || null;
}

export function findGlossaryTermsInText(text) {
  if (!text) return [];

  const terms = [];
  const seen = new Set();

  for (const [lower, entry] of glossaryLookup) {
    if (lower.length < 3) continue;
    if (keywordAbilities.has(lower)) continue;

    const pattern = new RegExp(`\\b${entry.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(text) && !seen.has(lower)) {
      seen.add(lower);
      terms.push(entry);
    }
  }

  return terms;
}

export { glossary as KEYWORD_GLOSSARY };
