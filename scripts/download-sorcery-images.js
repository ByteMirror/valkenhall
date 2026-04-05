import fs from 'node:fs/promises';
import path from 'node:path';

const CDN_BASE = 'https://d27a44hjr9gen3.cloudfront.net/cards';
const CARDS_PATH = path.resolve('public/sorcery-cards.json');
const OUTPUT_DIR = path.resolve('public/sorcery-images');
const CONCURRENCY = 10;

async function downloadImage(slug, outputPath) {
  const url = `${CDN_BASE}/${slug}.png`;
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${slug}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
  return buffer.length;
}

async function main() {
  const raw = JSON.parse(await fs.readFile(CARDS_PATH, 'utf8'));
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // One standard-finish variant per unique card, newest set first
  const slugsByCard = new Map();
  for (const card of raw) {
    const sets = (card.sets || []).sort((a, b) => new Date(b.releasedAt || 0) - new Date(a.releasedAt || 0));
    for (const set of sets) {
      const std = (set.variants || []).find(v => v.finish === 'Standard');
      if (std && !slugsByCard.has(card.name)) {
        slugsByCard.set(card.name, std.slug);
        break;
      }
    }
  }

  const allSlugs = [...slugsByCard.values()];
  console.log(`Found ${allSlugs.length} unique cards`);

  let index = 0;
  let completed = 0;
  let skipped = 0;
  let failed = 0;
  let totalBytes = 0;

  async function worker() {
    while (index < allSlugs.length) {
      const slug = allSlugs[index++];
      const outputPath = path.join(OUTPUT_DIR, `${slug}.png`);
      try {
        await fs.access(outputPath);
        skipped++;
        continue;
      } catch {
        // not cached — download it
      }
      try {
        const bytes = await downloadImage(slug, outputPath);
        totalBytes += bytes;
        completed++;
        const done = completed + failed;
        if (done % 50 === 0 || index === allSlugs.length) {
          const mb = (totalBytes / 1024 / 1024).toFixed(1);
          console.log(`  ${done}/${allSlugs.length - skipped} downloaded (${mb}MB, ${failed} failed)`);
        }
      } catch (error) {
        failed++;
        console.error(`  Failed: ${slug} - ${error.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const mb = (totalBytes / 1024 / 1024).toFixed(1);
  console.log(`\nDone! ${completed} downloaded (${mb}MB), ${skipped} cached, ${failed} failed.`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
