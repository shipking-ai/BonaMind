/**
 * Avatars don't accept SVG: the file pickers don't offer it, the upload service
 * refuses it (including when renamed to an image type), and the server's bucket
 * settings don't allow it (migration 20261030020000).
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

describe('the server no longer accepts svg', () => {
  it('removes it from the bucket and from the upload helper', () => {
    const sql = readFileSync(
      path.resolve(__dirname, '../../../supabase/migrations/20261030020000_avatars_no_svg.sql'),
      'utf8',
    );
    expect(sql).toContain("array_remove(allowed_mime_types, 'image/svg+xml')");
    expect(sql).toContain("WHERE id = 'avatars'");
    const helper = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'));
    expect(helper).not.toContain('svg');
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
