import fs from 'node:fs/promises';
import tailwindPlugin from 'bun-plugin-tailwind';
import { APP_BASE_PATH } from '../src/bun/runtime.js';

const result = await Bun.build({
  entrypoints: ['./index.html'],
  outdir: './dist',
  target: 'browser',
  sourcemap: 'linked',
  minify: true,
  publicPath: `${APP_BASE_PATH}/`,
  plugins: [tailwindPlugin],
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

await fs.copyFile('./public/cards.json', './dist/cards.json');
await fs.copyFile('./public/sorcery-cards.json', './dist/sorcery-cards.json');
await fs.copyFile('./public/valkenhall-logo.png', './dist/valkenhall-logo.png');
await fs.copyFile('./public/store-bg.png', './dist/store-bg.png').catch(() => {});
await fs.copyFile('./public/hub-bg.png', './dist/hub-bg.png').catch(() => {});
await fs.copyFile('./public/auction-bg.webp', './dist/auction-bg.webp').catch(() => {});
await fs.copyFile('./public/deck-builder-bg.webp', './dist/deck-builder-bg.webp').catch(() => {});
await fs.copyFile('./public/deck-builder-bg-dimmed.webp', './dist/deck-builder-bg-dimmed.webp').catch(() => {});
await fs.copyFile('./public/rune-divider.webp', './dist/rune-divider.webp').catch(() => {});
for (const tex of ['tex-stone', 'tex-chisel', 'tex-scratches', 'tex-cracks', 'tex-noise', 'tex-noise-panel', 'tex-noise-gold']) {
  await fs.copyFile(`./public/${tex}.webp`, `./dist/${tex}.webp`).catch(() => {});
}
await fs.cp('./public/cursors', './dist/cursors', { recursive: true }).catch(() => {});

// Bundle card images
await fs.cp('./public/sorcery-images', './dist/sorcery-images', { recursive: true }).catch(() => {});

// Bundle all audio files (music, sound effects)
const publicFiles = await fs.readdir('./public').catch(() => []);
for (const file of publicFiles) {
  if (file.endsWith('.mp3') || file.endsWith('.ogg') || file.endsWith('.wav')) {
    await fs.copyFile(`./public/${file}`, `./dist/${file}`).catch(() => {});
  }
}

// Bundle other game assets
for (const asset of ['battlemap.webp', 'table-background-hd.png', 'table-background.jpg',
  'cardback-spellbook-rounded.png', 'cardback-spellbook.png', 'cardback-atlas-rounded.png', 'cardback-atlas.jpg',
  'booster-gothic.webp', 'booster-arthurian.webp', 'booster-beta.webp',
  'monarch.jpg', 'spawn-config.json']) {
  await fs.copyFile(`./public/${asset}`, `./dist/${asset}`).catch(() => {});
}

console.log(`Built ${result.outputs.length} output files into dist/`);
