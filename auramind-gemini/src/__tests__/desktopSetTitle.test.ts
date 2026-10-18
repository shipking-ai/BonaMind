/**
 * desktop.setTitle: at launch the app lands on "/" and redirects straight to
 * "/dashboard", so two titles are set back to back. Sent together, the
 * window's async commands can finish out of order and leave the stale
 * "BonaMind" on Today. Titles go out one at a time, so the last one wins.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const pending = vi.hoisted(() => [] as Array<() => void>);
const win = vi.hoisted(() => ({
  setTitle: vi.fn((_title: string) => new Promise<void>((resolve) => { pending.push(resolve); })),
}));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => win }));

import { desktop } from '../desktop/bridge';

type W = Window & { __TAURI_INTERNALS__?: unknown };
beforeEach(() => { (window as W).__TAURI_INTERNALS__ = {}; win.setTitle.mockClear(); pending.length = 0; });
afterEach(() => { delete (window as W).__TAURI_INTERNALS__; });

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('desktop.setTitle', () => {
  it('sends the next title only after the previous one is applied', async () => {
    const first = desktop.setTitle('BonaMind');
    const second = desktop.setTitle('Today · BonaMind');
    await settle();
    expect(win.setTitle.mock.calls.map((c) => c[0])).toEqual(['BonaMind']);

    pending.shift()!();
    await first;
    await settle();
    expect(win.setTitle.mock.calls.map((c) => c[0])).toEqual(['BonaMind', 'Today · BonaMind']);

    pending.shift()!();
    await second;
  });
});
