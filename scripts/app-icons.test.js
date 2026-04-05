import { describe, expect, it } from 'bun:test';

import { createThemedIconSvg, MAC_ICONSET_FILES } from './app-icons.js';

describe('app icons', () => {
  it('recolors the source SVG for light and dark themed icon variants', () => {
    const sourceSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
        <path fill="black" d="M0 0h10v10H0z"/>
        <path fill="white" d="M2 2h6v6H2z"/>
      </svg>
    `;

    const darkSvg = createThemedIconSvg(sourceSvg, {
      backgroundColor: '#000000',
      foregroundColor: '#ffffff',
      title: 'Dark Icon',
    });

    expect(darkSvg).toContain('<title>Dark Icon</title>');
    expect(darkSvg).toContain('<linearGradient id="icon-background-gradient"');
    expect(darkSvg).toContain('<linearGradient id="icon-foreground-gradient"');
    expect(darkSvg).toContain('<rect width="1024" height="1024" fill="url(#icon-background-gradient)"/>');
    expect(darkSvg).toContain('<path d="M0 0h10v10H0z" fill="#000000" opacity="0.24" transform="translate(0 18)"/>');
    expect(darkSvg).toContain('<path fill="url(#icon-foreground-gradient)" d="M0 0h10v10H0z"/>');
    expect(darkSvg).toContain('<path fill="url(#icon-background-gradient)" d="M2 2h6v6H2z"/>');
    expect(darkSvg).not.toContain('fill="black"');
    expect(darkSvg).not.toContain('fill="white"');
  });

  it('defines the full macOS iconset file matrix ElectroBun expects', () => {
    expect(MAC_ICONSET_FILES).toEqual([
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
    ]);
  });
});
