/**
 * PDF import: pdf.js parses in a worker. It used to load that worker from
 * unpkg as `pdf.worker.min.js`, a file pdf.js 4+ no longer ships (the worker
 * is `.mjs` now), so every PDF failed with "Failed to extract text from PDF".
 * The Windows app's CSP (`worker-src 'self' blob:`) would have blocked unpkg
 * anyway. The worker now ships in the bundle, from the app's own origin.
 */
import { describe, it, expect } from 'vitest';
import * as pdfjsLib from 'pdfjs-dist';
import '../services/import/pdfService';

describe('pdf.js worker', () => {
  it('loads from the app bundle, not a CDN', () => {
    const src = pdfjsLib.GlobalWorkerOptions.workerSrc;
    expect(src).not.toMatch(/^https?:\/\//);
    expect(src).toMatch(/pdf\.worker(\.min)?\.mjs/);
  });
});
