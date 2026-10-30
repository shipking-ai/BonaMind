/**
 * Red-team regression for SVG avatars: profile images upload to a PUBLIC
 * bucket on our own origin, and every profile render points an <img> at
 * that origin — an SVG with an inline script stored there is stored XSS
 * (the script runs when the raw file is opened in-tab, whatever the site
 * does with it). SVG used to be an allowed picker type on two screens and
 * an always-pass in the upload service.
 *
 * SVG is now banned through three layers: the two file pickers' accept
 * lists no longer advertise it, the upload service's mime allowlist dropped
 * it, and — because the claimed mime can lie (profile.png that is really
 * XML) — uploads get their leading bytes sniffed and active XML is refused
 * regardless of the claimed type.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sniffsAsSvg } from '../services/user/avatarService';

describe('the upload service rejects svg payloads', () => {
  it('drops svg from the mime allowlist', () => {
    const src = readFileSync(path.resolve(__dirname, '../services/user/avatarService.ts'), 'utf8');
    expect(src).not.toMatch(/image\/svg\+xml/);
  });

  it('sniffs an svg renamed to .png from its own bytes', async () => {
    const svg = new File(
      ['<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'],
      'profile.png',
      { type: 'image/png' },
    );
    expect(await sniffsAsSvg(svg)).toBe(true);
  });

  it('accepts real raster bytes', async () => {
    // PNG magic number filler.
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'a.png', {
      type: 'image/png',
    });
    expect(await sniffsAsSvg(png)).toBe(false);
  });
});

describe('the pickers no longer advertise svg', () => {
  it('web and android accept lists ban image/svg+xml', () => {
    for (const file of ['src/pages/settings/SettingsPage.tsx', 'src/components/native/AndroidSettingsScreen.tsx']) {
      const src = readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
      expect(src, `${file} must not accept image/svg+xml`).not.toMatch(/image\/svg\+xml/);
      expect(src, `${file} must still accept raster types`).toMatch(/image\/png,image\/jpeg/);
    }
  });
});
