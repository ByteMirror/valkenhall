import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const SOURCE_PNG = path.join(projectRoot, 'assets/Icon-iOS-Default-1024x1024@1x.png');
const PUBLIC_DIR = path.join(projectRoot, 'public');
const ICONSET_DIR = path.join(projectRoot, 'assets/app-icons/icon.iconset');

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

export async function generateAppIcons() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.log('Sharp not available — skipping icon generation (using pre-built icons)');
    return;
  }

  const sourceBuffer = await fs.readFile(SOURCE_PNG);

  // Generate macOS iconset
  await fs.mkdir(ICONSET_DIR, { recursive: true });
  for (const { name, size } of MAC_ICONSET_FILES) {
    await sharp(sourceBuffer).resize(size, size).png().toFile(path.join(ICONSET_DIR, name));
  }
  console.log(`Generated ${MAC_ICONSET_FILES.length} macOS iconset files`);

  // Generate Linux/public icon (512x512)
  await sharp(sourceBuffer).resize(512, 512).png().toFile(path.join(PUBLIC_DIR, 'app-icon.png'));
  console.log('Generated public/app-icon.png');
}

// Run if called directly
if (process.argv[1]?.endsWith('app-icons.js')) {
  generateAppIcons().catch((err) => {
    console.error('Failed to generate icons:', err);
    process.exit(1);
  });
}
