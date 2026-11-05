/**
 * Guards the Windows updater key story end to end.
 *
 * A stale, retired public key once sat checked-in as
 * `bonamind-web/privatekey.pem.pub` (key id `RWTWhOm2…`). The updater
 * itself trusts the key embedded in `tauri.conf.json`'s
 * `plugins.updater.pubkey` (key id `RWQuHPDp…`, matching DEPLOYMENT.md).
 * If someone ever "fixed" the config to match the stale file instead, every
 * installed Windows app would stop accepting updates, so the file had to
 * go and the config's real key stays pinned here.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..', '..');

describe('the Windows updater key', () => {
  it('no stale retired public key remains checked in', () => {
    expect(existsSync(path.join(WEB, 'privatekey.pem.pub'))).toBe(false);
  });

  it('gitignore covers every privatekey.pem variant', () => {
    const gitignore = readFileSync(path.join(WEB, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/privatekey\.pem\*/);
  });

  it('the updater config keeps the real key (RWQuHPDp…), unchanged', () => {
    const conf = JSON.parse(readFileSync(path.join(WEB, 'src-tauri', 'tauri.conf.json'), 'utf8'));
    const encoded = conf?.plugins?.updater?.pubkey;
    if (!encoded) throw new Error('tauri.conf.json lost plugins.updater.pubkey');
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    expect(decoded).toContain('RWQuHPDpVwhZ');
    expect(decoded).not.toContain('RWTWhOm2');
  });
});
