// Regenerate the STARTER_DECKS array in src/utils/arena/starterDecks.js
// from the Sorcery TCG Official Curiosa precons.
//
// Usage: `bun run scripts/fetch-starter-decks.js`
//
// The fetcher pulls each deck via Curiosa's tRPC endpoints, splits the
// decklist into Spellbook / Atlas by card type, collapses duplicate
// print variants by card name, and writes the result to stdout as a
// zone-aware STARTER_DECKS literal. The hand-curated `id`, `name`,
// `elements`, and `description` fields from the existing file are
// preserved so the starter-picker UI keeps its wording unchanged.
//
// If Sorcery TCG Official updates the precons upstream, re-run this
// script and replace the generated block in starterDecks.js.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STARTER_DECKS_PATH = join(__dirname, '..', 'src', 'utils', 'arena', 'starterDecks.js');

// The four Gothic set precons, in the order they appear in the current
// starter picker. Curiosa deck IDs are permanent so these links are
// safe to hardcode.
const DECKS = [
  { id: 'savior',      curiosaId: 'cmip2v28500k6l204a5bxo5oh' },
  { id: 'necromancer', curiosaId: 'cmip2vh9y00kal204778yzvbd' },
  { id: 'persecutor',  curiosaId: 'cmip2vwc100khl2043cgtpae7' },
  { id: 'harbinger',   curiosaId: 'cmip2w8qa002mjl04intv339z' },
];

const HEADERS = {
  'Origin': 'https://curiosa.io',
  'User-Agent': 'Mozilla/5.0 (Valkenhall starter-deck fetcher)',
};

async function trpc(proc, id) {
  const input = encodeURIComponent(JSON.stringify({ json: { id } }));
  const url = `https://curiosa.io/api/trpc/${proc}?input=${input}`;
  const res = await fetch(url, { headers: { ...HEADERS, 'Referer': `https://curiosa.io/decks/${id}` } });
  if (!res.ok) throw new Error(`${proc} ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`${proc} ${body.error.json?.message}`);
  return body.result.data.json;
}

// Collapse multi-variant rows by card name so the output has one line
// per unique card with the total quantity. Sorted alphabetically so
// regenerations produce stable diffs.
function collapse(rows) {
  const byName = new Map();
  for (const r of rows) {
    const name = r.card?.name;
    if (!name) continue;
    byName.set(name, (byName.get(name) || 0) + (r.quantity || 0));
  }
  return Array.from(byName.entries())
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Extract the existing `name`, `elements`, and `description` fields from
// the current starterDecks.js so regenerations preserve hand-curated UI
// copy. The file is a plain ES module — we import it dynamically.
async function loadExistingMetadata() {
  const existing = await import(STARTER_DECKS_PATH);
  const byId = new Map();
  for (const d of existing.STARTER_DECKS || []) {
    byId.set(d.id, {
      name: d.name,
      elements: d.elements,
      description: d.description,
    });
  }
  return byId;
}

function serializeDeck(deck) {
  let out = '';
  out += `  {\n`;
  out += `    id: ${JSON.stringify(deck.id)},\n`;
  out += `    name: ${JSON.stringify(deck.name)},\n`;
  out += `    elements: ${JSON.stringify(deck.elements)},\n`;
  out += `    description: ${JSON.stringify(deck.description)},\n`;
  out += `    curiosaDeckId: ${JSON.stringify(deck.curiosaDeckId)},\n`;
  out += `    avatar: ${JSON.stringify(deck.avatar)},\n`;
  for (const zone of ['spellbook', 'atlas', 'collection']) {
    out += `    ${zone}: [\n`;
    for (const c of deck[zone]) {
      out += `      { name: ${JSON.stringify(c.name)}, qty: ${c.qty} },\n`;
    }
    out += `    ],\n`;
  }
  out += `  }`;
  return out;
}

const metadata = await loadExistingMetadata();
const decks = [];

for (const { id, curiosaId } of DECKS) {
  const meta = await trpc('deck.getById', curiosaId);
  const decklist = await trpc('deck.getDecklistById', curiosaId);
  const sideboard = await trpc('deck.getSideboardById', curiosaId);
  const avatarRow = await trpc('deck.getAvatarById', curiosaId);

  // The Curiosa decklist mixes Spellbook and Atlas; split by type.
  const spellbookRaw = decklist.filter((r) => r.card?.type !== 'Site');
  const atlasRaw = decklist.filter((r) => r.card?.type === 'Site');

  const spellbookTotal = spellbookRaw.reduce((s, r) => s + (r.quantity || 0), 0);
  const atlasTotal = atlasRaw.reduce((s, r) => s + (r.quantity || 0), 0);
  const sideboardTotal = sideboard.reduce((s, r) => s + (r.quantity || 0), 0);

  console.error(
    `[${id}] ${meta.name} — avatar=${avatarRow?.card?.name} ` +
    `spellbook=${spellbookTotal} atlas=${atlasTotal} collection=${sideboardTotal}`,
  );

  const curated = metadata.get(id);
  if (!curated) {
    throw new Error(`No existing metadata for deck id "${id}" — add it to starterDecks.js first.`);
  }

  decks.push({
    id,
    name: curated.name,
    elements: curated.elements,
    description: curated.description,
    curiosaDeckId: curiosaId,
    avatar: avatarRow?.card?.name || null,
    spellbook: collapse(spellbookRaw),
    atlas: collapse(atlasRaw),
    collection: collapse(sideboard),
  });
}

// Emit the fully-formed STARTER_DECKS export. The rest of starterDecks.js
// (the resolveStarterDeck function) stays put; the caller is expected to
// paste this output in place of the existing `export const STARTER_DECKS`.
let out = '';
out += `// Sorcery TCG starter decks — the four Gothic set precons published\n`;
out += `// by Sorcery TCG Official on Curiosa. Each deck has an Avatar, a\n`;
out += `// Spellbook (main deck), an Atlas (sites), and a Collection (side-\n`;
out += `// board). Regenerate via scripts/fetch-starter-decks.js.\n`;
out += `//\n`;
out += `// Source (curiosa.io/decks/<curiosaDeckId>):\n`;
for (const d of decks) out += `//   ${d.id}: ${d.curiosaDeckId}\n`;
out += `export const STARTER_DECKS = [\n`;
out += decks.map(serializeDeck).join(',\n');
out += `,\n];\n`;

console.log(out);
