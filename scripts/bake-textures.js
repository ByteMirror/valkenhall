/**
 * Pre-renders SVG filter textures to static WebP files.
 * Run once at build time — the resulting images are used as
 * background-image URLs in medievalTheme.jsx, replacing the
 * inline SVG data URLs for better performance.
 *
 * Usage: bun scripts/bake-textures.js
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve('public');
const TILE = 300;
const TILE_SM = 200;

const TEXTURES = [
  {
    name: 'tex-stone',
    width: TILE, height: TILE,
    svg: `<svg xmlns='http://www.w3.org/2000/svg' width='${TILE}' height='${TILE}'><filter id='st'><feTurbulence type='turbulence' baseFrequency='0.18' numOctaves='4' seed='5' stitchTiles='stitch' result='noise'/><feDiffuseLighting in='noise' lighting-color='#c9a84c' surfaceScale='2.5' diffuseConstant='0.7' result='lit'><feDistantLight azimuth='220' elevation='28'/></feDiffuseLighting><feComposite in='lit' in2='noise' operator='in'/><feComponentTransfer><feFuncA type='linear' slope='0.12' intercept='0'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(#st)'/></svg>`,
  },
  {
    name: 'tex-chisel',
    width: TILE, height: TILE,
    svg: `<svg xmlns='http://www.w3.org/2000/svg' width='${TILE}' height='${TILE}'><filter id='ch'><feTurbulence type='turbulence' baseFrequency='0.08 0.4' numOctaves='3' seed='12' stitchTiles='stitch' result='noise'/><feDiffuseLighting in='noise' lighting-color='#b48c3c' surfaceScale='1.8' diffuseConstant='0.75' result='lit'><feDistantLight azimuth='240' elevation='32'/></feDiffuseLighting><feComposite in='lit' in2='noise' operator='in'/><feComponentTransfer><feFuncA type='linear' slope='0.08' intercept='0'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(#ch)'/></svg>`,
  },
  {
    name: 'tex-scratches',
    width: TILE_SM, height: TILE_SM,
    svg: `<svg xmlns='http://www.w3.org/2000/svg' width='${TILE_SM}' height='${TILE_SM}'><filter id='s'><feTurbulence type='turbulence' baseFrequency='0.4 0.06' numOctaves='2' seed='8' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='linear' slope='0.18' intercept='-0.06'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(#s)'/></svg>`,
  },
  {
    name: 'tex-cracks',
    width: TILE, height: TILE,
    svg: `<svg xmlns='http://www.w3.org/2000/svg' width='${TILE}' height='${TILE}'><filter id='c'><feTurbulence type='fractalNoise' baseFrequency='0.03' numOctaves='5' seed='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncR type='discrete' tableValues='0 0 0 0 0 0 0 0.06'/><feFuncG type='discrete' tableValues='0 0 0 0 0 0 0 0.05'/><feFuncB type='discrete' tableValues='0 0 0 0 0 0 0 0.04'/><feFuncA type='discrete' tableValues='0 0 0 0 0 0 0.12 0.25'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(#c)'/></svg>`,
  },
  {
    name: 'tex-noise',
    width: TILE_SM, height: TILE_SM,
    svg: `<svg xmlns='http://www.w3.org/2000/svg' width='${TILE_SM}' height='${TILE_SM}'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(#n)' opacity='0.04'/></svg>`,
  },
  {
    name: 'tex-noise-panel',
    width: TILE_SM, height: TILE_SM,
    svg: `<svg xmlns='http://www.w3.org/2000/svg' width='${TILE_SM}' height='${TILE_SM}'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(#n)' opacity='0.12'/></svg>`,
  },
  {
    name: 'tex-noise-gold',
    width: TILE_SM, height: TILE_SM,
    svg: `<svg xmlns='http://www.w3.org/2000/svg' width='${TILE_SM}' height='${TILE_SM}'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(#n)' opacity='0.06'/></svg>`,
  },
];

// Use sharp if available (for WebP), otherwise save as PNG
let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.warn('sharp not available — saving textures as PNG');
}

for (const tex of TEXTURES) {
  const svgBuffer = Buffer.from(tex.svg);
  const outPath = path.join(OUT_DIR, `${tex.name}.webp`);

  if (sharp) {
    await sharp(svgBuffer, { density: 72 })
      .resize(tex.width, tex.height)
      .webp({ quality: 80, alphaQuality: 90 })
      .toFile(outPath);
  } else {
    // Fallback: save raw SVG (browsers can still use it)
    await fs.writeFile(path.join(OUT_DIR, `${tex.name}.svg`), tex.svg);
  }

  const stat = await fs.stat(outPath).catch(() => null);
  console.log(`  ${tex.name}.webp — ${stat ? `${(stat.size / 1024).toFixed(1)}KB` : 'failed'}`);
}

console.log('Done! Textures baked to public/');
