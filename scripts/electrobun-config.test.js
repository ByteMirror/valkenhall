import { expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import electrobunConfig from '../electrobun.config.ts';

test('desktop shell bundles CEF and defaults desktop windows to the CEF renderer', async () => {
  expect(electrobunConfig.build.mac?.bundleCEF).toBe(true);
  expect(electrobunConfig.build.mac?.defaultRenderer).toBe('cef');

  const desktopEntry = await fs.readFile(path.join(process.cwd(), 'src', 'bun', 'index.js'), 'utf8');

  expect(desktopEntry).toContain("renderer: 'cef'");
});
