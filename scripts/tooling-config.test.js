import { expect, test } from 'bun:test';
import packageJson from '../package.json';

test('package scripts use Bun-native tooling instead of Vite or Vitest CLIs', () => {
  expect(packageJson.scripts['dev:vite']).toBeUndefined();
  expect(packageJson.scripts.dev).toContain('bun run');
  expect(packageJson.scripts['desktop:renderer:dev']).toContain('bun ');
  expect(packageJson.scripts.build).toContain('bun ');
  expect(packageJson.scripts.preview).toContain('bun ');
  expect(packageJson.scripts.test).toContain('bun test');

  for (const script of Object.values(packageJson.scripts)) {
    expect(script).not.toContain('vite');
    expect(script).not.toContain('vitest');
  }
});

test('desktop renderer dev script passes the port before the html entrypoint', () => {
  expect(packageJson.scripts['dev:renderer']).toBe('bun --port 5173 --hot index.html --console');
});

test('desktop dev uses the built preview renderer instead of the Bun HMR server', () => {
  expect(packageJson.scripts['desktop:dev']).toContain('bun run build:renderer');
  expect(packageJson.scripts['desktop:dev']).toContain('bun run desktop:renderer:dev');
  expect(packageJson.scripts['desktop:renderer:dev']).toContain('bun --watch scripts/build-web.js');
  expect(packageJson.scripts['desktop:renderer:dev']).toContain('bun run preview');
  expect(packageJson.scripts['desktop:dev:app']).toContain('http://127.0.0.1:4173');
});
