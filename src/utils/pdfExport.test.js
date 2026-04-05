import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { PDFDocument } from 'pdf-lib';
import {
  mmToPoints,
  computeCardGrid,
  generateProxyPdf,
  detectImageFormat,
  PAGE_PRESETS,
} from './pdfExport';

// Minimal 1x1 white PNG (67 bytes) — used for detectImageFormat tests
const TINY_PNG = new Uint8Array([
  137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,0,0,0,
  144,119,83,222,0,0,0,12,73,68,65,84,8,215,99,248,207,192,0,0,0,3,0,1,54,
  40,207,208,0,0,0,0,73,69,78,68,174,66,96,130,
]);

// Minimal JPEG — used for generateProxyPdf tests (all images are now JPEG)
const TINY_JPG = new Uint8Array(readFileSync(new URL('./test-fixtures/tiny.jpg', import.meta.url)));

describe('mmToPoints', () => {
  it('converts millimeters to PDF points', () => {
    expect(mmToPoints(25.4)).toBeCloseTo(72, 1);
    expect(mmToPoints(0)).toBe(0);
  });
});

describe('computeCardGrid', () => {
  it('computes a 3x3 grid on A4 with default settings (gap=0)', () => {
    const grid = computeCardGrid({
      pageWidth: PAGE_PRESETS.a4.width,
      pageHeight: PAGE_PRESETS.a4.height,
      cardWidthMm: 63,
      cardHeightMm: 88,
      marginMm: 8,
      gapMm: 0,
    });

    expect(grid.cols).toBe(3);
    expect(grid.rows).toBe(3);
    expect(grid.cardsPerPage).toBe(9);
    expect(grid.positions).toHaveLength(9);
    expect(grid.positions[0].x).toBeGreaterThan(0);
    expect(grid.positions[0].y).toBeGreaterThan(0);
  });

  it('computes positions for letter size (gap=0)', () => {
    const grid = computeCardGrid({
      pageWidth: PAGE_PRESETS.letter.width,
      pageHeight: PAGE_PRESETS.letter.height,
      cardWidthMm: 63,
      cardHeightMm: 88,
      marginMm: 8,
      gapMm: 0,
    });

    expect(grid.cols).toBe(3);
    // Letter is shorter than A4 — only 2 rows of 88mm cards fit
    expect(grid.rows).toBe(2);
    expect(grid.cardsPerPage).toBe(6);
  });
});

describe('detectImageFormat', () => {
  it('detects JPEG from bytes', () => {
    const jpg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0]);
    expect(detectImageFormat(jpg)).toBe('jpg');
  });

  it('detects PNG from bytes', () => {
    expect(detectImageFormat(TINY_PNG)).toBe('png');
  });

  it('returns unknown for unrecognized formats', () => {
    expect(detectImageFormat(new Uint8Array([0, 0, 0, 0]))).toBe('unknown');
  });
});

describe('generateProxyPdf', () => {
  it('creates a PDF with the correct number of pages for 10 cards on A4', async () => {
    const cards = Array.from({ length: 10 }, () => ({
      imageBytes: TINY_JPG,
      format: 'jpg',
    }));

    const pdfBytes = await generateProxyPdf({ cards });

    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(2);
  });

  it('creates a single page for 1 card', async () => {
    const cards = [{ imageBytes: TINY_JPG, format: 'jpg' }];
    const pdfBytes = await generateProxyPdf({ cards });

    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('returns a Uint8Array with PDF magic bytes', async () => {
    const cards = [{ imageBytes: TINY_JPG, format: 'jpg' }];
    const pdfBytes = await generateProxyPdf({ cards });
    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes[0]).toBe(0x25); // %
    expect(pdfBytes[1]).toBe(0x50); // P
  });

  it('respects letter page size', async () => {
    const cards = Array.from({ length: 10 }, () => ({
      imageBytes: TINY_JPG,
      format: 'jpg',
    }));

    const pdfBytes = await generateProxyPdf({
      cards,
      pagePreset: 'letter',
    });

    const doc = await PDFDocument.load(pdfBytes);
    const page = doc.getPage(0);
    expect(page.getWidth()).toBeCloseTo(PAGE_PRESETS.letter.width, 0);
    expect(page.getHeight()).toBeCloseTo(PAGE_PRESETS.letter.height, 0);
  });

  it('deduplicates identical images across pages', async () => {
    const cards = Array.from({ length: 20 }, () => ({
      imageBytes: TINY_JPG,
      format: 'jpg',
    }));

    const pdfBytes = await generateProxyPdf({ cards });
    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(3);
  });
});
