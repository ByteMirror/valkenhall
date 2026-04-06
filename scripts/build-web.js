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
await fs.copyFile('./public/rune-divider.webp', './dist/rune-divider.webp').catch(() => {});
for (const tex of ['tex-stone', 'tex-chisel', 'tex-scratches', 'tex-cracks', 'tex-noise', 'tex-noise-panel', 'tex-noise-gold']) {
  await fs.copyFile(`./public/${tex}.webp`, `./dist/${tex}.webp`).catch(() => {});
}
await fs.cp('./public/cursors', './dist/cursors', { recursive: true }).catch(() => {});

console.log(`Built ${result.outputs.length} output files into dist/`);
