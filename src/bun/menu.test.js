import { describe, expect, it } from 'bun:test';
import { buildApplicationMenu } from './menu.js';

describe('buildApplicationMenu', () => {
  it('returns a native macOS-style app menu with standard edit and window roles', () => {
    const menu = buildApplicationMenu();

    expect(menu[0]).toEqual({
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'showAll' },
        { type: 'separator' },
        { role: 'quit', accelerator: 'q' },
      ],
    });

    expect(menu).toContainEqual({
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    });

    expect(menu).toContainEqual({
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'bringAllToFront' },
      ],
    });
  });
});
