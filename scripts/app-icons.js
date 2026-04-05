import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ICON_CANVAS_SIZE = 1024;
const DEFAULT_LIGHT_BACKGROUND = '#f5f5f1';
const DEFAULT_LIGHT_FOREGROUND = '#000000';
const DEFAULT_DARK_BACKGROUND = '#000000';
const DEFAULT_DARK_FOREGROUND = '#ffffff';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

export const MAC_ICONSET_FILES = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 },
];

function stripMetadata(svgMarkup) {
  return svgMarkup
    .replace(/<title[\s\S]*?<\/title>/gi, '')
    .replace(/<desc[\s\S]*?<\/desc>/gi, '');
}

function getThemePalette(foregroundColor) {
  const isDarkTheme = foregroundColor.toLowerCase() === '#ffffff';

  if (isDarkTheme) {
    return {
      backgroundStart: '#111111',
      backgroundEnd: '#000000',
      foregroundStart: '#ffffff',
      foregroundMid: '#e9e9e9',
      foregroundEnd: '#cfcfcf',
      sheenColor: '#ffffff',
      sheenOpacity: '0.28',
      shadowColor: '#000000',
      shadowOpacity: '0.24',
      innerGlowColor: '#ffffff',
      innerGlowOpacity: '0.14',
    };
  }

  return {
    backgroundStart: '#faf8f3',
    backgroundEnd: '#dfdbd1',
    foregroundStart: '#050505',
    foregroundMid: '#151515',
    foregroundEnd: '#3d3d3d',
    sheenColor: '#ffffff',
    sheenOpacity: '0.18',
    shadowColor: '#000000',
    shadowOpacity: '0.12',
    innerGlowColor: '#ffffff',
    innerGlowOpacity: '0.08',
  };
}

function extractPrimaryForegroundPath(innerSvgMarkup) {
  for (const pathTag of innerSvgMarkup.match(/<path\b[^>]*\/?>/gi) ?? []) {
    const fillMatch = pathTag.match(/\bfill=(['"])(black|#000|#000000)\1/i);
    const dMatch = pathTag.match(/\bd=(['"])(.*?)\1/i);

    if (fillMatch && dMatch) {
      return dMatch[2];
    }
  }

  return null;
}

export function createThemedIconSvg(sourceSvg, { backgroundColor, foregroundColor, title }) {
  const svgMatch = sourceSvg.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i);

  if (!svgMatch) {
    throw new Error('Expected a valid SVG document');
  }

  const innerSvgMarkup = stripMetadata(svgMatch[1]);
  const shieldPath = extractPrimaryForegroundPath(innerSvgMarkup);
  const palette = getThemePalette(foregroundColor);

  const themedMarkup = innerSvgMarkup
    .replace(/\bfill=(['"])(black|#000|#000000)\1/gi, 'fill="__APP_ICON_FOREGROUND__"')
    .replace(/\bfill=(['"])(white|#fff|#ffffff)\1/gi, 'fill="__APP_ICON_BACKGROUND__"')
    .replace(/__APP_ICON_FOREGROUND__/g, 'url(#icon-foreground-gradient)')
    .replace(/__APP_ICON_BACKGROUND__/g, 'url(#icon-background-gradient)')
    .trim();

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_CANVAS_SIZE}" height="${ICON_CANVAS_SIZE}" viewBox="0 0 ${ICON_CANVAS_SIZE} ${ICON_CANVAS_SIZE}" fill="none">`,
    `  <title>${title}</title>`,
    '  <defs>',
    '    <linearGradient id="icon-background-gradient" x1="132" y1="96" x2="892" y2="948" gradientUnits="userSpaceOnUse">',
    `      <stop offset="0" stop-color="${palette.backgroundStart}"/>`,
    `      <stop offset="1" stop-color="${palette.backgroundEnd}"/>`,
    '    </linearGradient>',
    '    <linearGradient id="icon-foreground-gradient" x1="308" y1="172" x2="728" y2="924" gradientUnits="userSpaceOnUse">',
    `      <stop offset="0" stop-color="${palette.foregroundStart}"/>`,
    `      <stop offset="0.52" stop-color="${palette.foregroundMid}"/>`,
    `      <stop offset="1" stop-color="${palette.foregroundEnd}"/>`,
    '    </linearGradient>',
    '    <linearGradient id="icon-sheen-gradient" x1="280" y1="140" x2="612" y2="526" gradientUnits="userSpaceOnUse">',
    `      <stop offset="0" stop-color="${palette.sheenColor}" stop-opacity="${palette.sheenOpacity}"/>`,
    `      <stop offset="1" stop-color="${palette.sheenColor}" stop-opacity="0"/>`,
    '    </linearGradient>',
    '    <radialGradient id="icon-inner-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(512 320) rotate(90) scale(520 420)">',
    `      <stop offset="0" stop-color="${palette.innerGlowColor}" stop-opacity="${palette.innerGlowOpacity}"/>`,
    `      <stop offset="1" stop-color="${palette.innerGlowColor}" stop-opacity="0"/>`,
    '    </radialGradient>',
    shieldPath ? '    <clipPath id="icon-shield-clip">' : null,
    shieldPath ? `      <path d="${shieldPath}"/>` : null,
    shieldPath ? '    </clipPath>' : null,
    '  </defs>',
    `  <rect width="${ICON_CANVAS_SIZE}" height="${ICON_CANVAS_SIZE}" fill="url(#icon-background-gradient)"/>`,
    shieldPath
      ? `  <path d="${shieldPath}" fill="${palette.shadowColor}" opacity="${palette.shadowOpacity}" transform="translate(0 18)"/>`
      : null,
    themedMarkup
      .split('\n')
      .map((line) => `  ${line.trimEnd()}`)
      .join('\n'),
    shieldPath
      ? '    <g clip-path="url(#icon-shield-clip)">\n' +
        '      <ellipse cx="388" cy="244" rx="226" ry="156" fill="url(#icon-sheen-gradient)"/>\n' +
        '      <ellipse cx="536" cy="366" rx="268" ry="228" fill="url(#icon-inner-glow)"/>\n' +
        '    </g>'
      : null,
    '</svg>',
    '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function resetDirectory(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
  await ensureDirectory(dirPath);
}

async function renderPngFromSvg(svgMarkup, outputPath, size) {
  await sharp(Buffer.from(svgMarkup)).resize(size, size).png().toFile(outputPath);
}

export async function generateAppIcons({
  sourceSvgPath = path.join(projectRoot, 'assets/app-icons/source/arsenal-app-icon.svg'),
  publicDir = path.join(projectRoot, 'public'),
  macIconsetDir = path.join(projectRoot, 'assets/app-icons/icon.iconset'),
} = {}) {
  const sourceSvg = await fs.readFile(sourceSvgPath, 'utf8');

  const lightSvg = createThemedIconSvg(sourceSvg, {
    backgroundColor: DEFAULT_LIGHT_BACKGROUND,
    foregroundColor: DEFAULT_LIGHT_FOREGROUND,
    title: 'Fab Builder App Icon Light',
  });

  const darkSvg = createThemedIconSvg(sourceSvg, {
    backgroundColor: DEFAULT_DARK_BACKGROUND,
    foregroundColor: DEFAULT_DARK_FOREGROUND,
    title: 'Fab Builder App Icon Dark',
  });

  await ensureDirectory(publicDir);
  await resetDirectory(macIconsetDir);

  await fs.writeFile(path.join(publicDir, 'app-icon-light.svg'), lightSvg);
  await fs.writeFile(path.join(publicDir, 'app-icon-dark.svg'), darkSvg);

  await Promise.all([
    renderPngFromSvg(lightSvg, path.join(publicDir, 'app-icon.png'), ICON_CANVAS_SIZE),
    renderPngFromSvg(darkSvg, path.join(publicDir, 'app-icon-dark.png'), ICON_CANVAS_SIZE),
    ...MAC_ICONSET_FILES.map(({ name, size }) =>
      renderPngFromSvg(lightSvg, path.join(macIconsetDir, name), size),
    ),
  ]);

  return {
    publicDir,
    macIconsetDir,
  };
}

if (import.meta.main) {
  const { publicDir, macIconsetDir } = await generateAppIcons();
  console.log(`Generated app icons in ${path.relative(projectRoot, publicDir)}`);
  console.log(`Generated macOS iconset in ${path.relative(projectRoot, macIconsetDir)}`);
}
