// Utility functions for importing decks from Fabrary URLs

const FABRARY_DECK_URL_PATTERN = /fabrary\.net\/decks\/([A-Z0-9]+)/i;

// Try multiple CORS proxies as fallbacks
const CORS_PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
  'https://cors-anywhere.herokuapp.com/',
];

export function isFabraryUrl(text) {
  return FABRARY_DECK_URL_PATTERN.test(text);
}

export function extractDeckId(url) {
  const match = url.match(FABRARY_DECK_URL_PATTERN);
  return match ? match[1] : null;
}

export async function fetchFabraryDeck(deckId) {
  const fabraryUrl = `https://fabrary.net/decks/${deckId}`;

  // Try each CORS proxy in order
  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const proxy = CORS_PROXIES[i];
    const proxiedUrl = `${proxy}${encodeURIComponent(fabraryUrl)}`;

    try {
      console.log(`Attempting to fetch with proxy ${i + 1}/${CORS_PROXIES.length}...`);
      const response = await fetch(proxiedUrl, {
        method: 'GET',
        headers: {
          'Accept': 'text/html',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();

      // Validate we got HTML content
      if (!html || html.length < 100) {
        throw new Error('Invalid response from proxy');
      }

      return parseFabraryDeck(html);
    } catch (error) {
      console.warn(`Proxy ${i + 1} failed:`, error.message);

      // If this was the last proxy, throw the error
      if (i === CORS_PROXIES.length - 1) {
        throw new Error('All CORS proxies failed. Please use the "Copy card list" method instead.');
      }

      // Otherwise, continue to next proxy
      continue;
    }
  }
}

function parseFabraryDeck(html) {
  // Create a temporary DOM element to parse the HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Extract all image alt text which contains card names
  const images = doc.querySelectorAll('img[alt]');
  const cardNames = Array.from(images)
    .map(img => img.alt)
    .filter(alt => alt &&
            alt !== 'Loading' &&
            !alt.includes('Language Picker') &&
            !alt.includes('NitroPay') &&
            alt.length > 1 &&
            alt.length < 100);

  // Count occurrences of each card
  const cardCounts = {};
  cardNames.forEach(name => {
    cardCounts[name] = (cardCounts[name] || 0) + 1;
  });

  // Convert to "Nx CardName" format
  const deckList = Object.entries(cardCounts)
    .map(([name, count]) => `${count}x ${name}`)
    .join('\n');

  return deckList;
}

export async function importFromFabraryUrl(url) {
  const deckId = extractDeckId(url);
  if (!deckId) {
    throw new Error('Invalid Fabrary URL');
  }

  return await fetchFabraryDeck(deckId);
}
