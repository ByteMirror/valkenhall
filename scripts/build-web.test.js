import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const buildScript = fs.readFileSync(path.join(import.meta.dir, 'build-web.js'), 'utf8');

test('renderer build copies cards.json to the dist root used by the Bun preview server', () => {
  expect(buildScript).toContain("await fs.copyFile('./public/cards.json', './dist/cards.json');");
});
