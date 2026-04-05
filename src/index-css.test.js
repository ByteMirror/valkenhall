import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'bun:test';

describe('global page background styles', () => {
  it('keeps a flat #FEFEFE light canvas and a subtle #141414 dark gradient canvas without decorative overlays', () => {
    const styles = readFileSync(`${process.cwd()}/src/index.css`, 'utf8');

    expect(styles).toMatch(/body\s*\{[\s\S]*background:\s*#fefefe;/i);
    expect(styles).toMatch(/\.dark body\s*\{[\s\S]*background:\s*[\s\S]*#141414/i);
    expect(styles).toMatch(/\.dark body\s*\{[\s\S]*radial-gradient/i);
    expect(styles).toMatch(/\.dark body\s*\{[\s\S]*linear-gradient/i);
    expect(styles).not.toMatch(/body::before\s*\{/i);
  });
});
