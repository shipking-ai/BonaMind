import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The emails Supabase Auth sends (password reset, sign-up confirmation, …).
 *
 * The live ones were still the pre-rename originals: "[AURAMIND] Reset Access
 * Key", "RESET INTERFACE KEY", "If you did not issue this command, ignore
 * this transmission". These files are the BonaMind versions. Supabase reads
 * them from config.toml locally; production gets them pasted into
 * Dashboard -> Auth -> Email Templates (see supabase/templates/README.md).
 */

const dir = resolve(__dirname, '../../supabase/templates');
const config = readFileSync(resolve(__dirname, '../../supabase/config.toml'), 'utf8');

const TEMPLATES = [
  { kind: 'recovery', link: '{{ .ConfirmationURL }}' },
  { kind: 'confirmation', link: '{{ .ConfirmationURL }}' },
  { kind: 'magic_link', link: '{{ .ConfirmationURL }}' },
  { kind: 'email_change', link: '{{ .ConfirmationURL }}' },
  { kind: 'invite', link: '{{ .ConfirmationURL }}' },
  { kind: 'reauthentication', link: '{{ .Token }}' },
] as const;

function read(kind: string) {
  return readFileSync(resolve(dir, `${kind}.html`), 'utf8');
}

function subjectOf(kind: string): string | undefined {
  const block = config.match(new RegExp(`^\\[auth\\.email\\.template\\.${kind}\\]\\s*\\n([\\s\\S]*?)(?=^\\[|$(?![\\s\\S]))`, 'm'));
  return block?.[1].match(/^subject\s*=\s*"([^"]+)"/m)?.[1];
}

describe('auth email templates', () => {
  it.each(TEMPLATES)('$kind exists, is wired up, and carries its link or code', ({ kind, link }) => {
    expect(existsSync(resolve(dir, `${kind}.html`))).toBe(true);
    expect(config).toMatch(new RegExp(`^\\[auth\\.email\\.template\\.${kind}\\]\\s*\\n(?:.*\\n)*?content_path = "\\./supabase/templates/${kind}\\.html"`, 'm'));
    expect(read(kind)).toContain(link);
  });

  it.each(TEMPLATES)('$kind is BonaMind, in plain words', ({ kind }) => {
    const html = read(kind);
    const subject = subjectOf(kind) ?? '';
    for (const text of [html, subject]) {
      expect(text).not.toMatch(/aura\s*mind/i);
      expect(text).not.toMatch(/interface key|access key|transmission|sequence was initiated|protocol|gateway/i);
    }
    expect(html).toContain('BonaMind');
    expect(subject).toContain('BonaMind');
    // No bracketed tag like "[AURAMIND]" in the subject line.
    expect(subject).not.toMatch(/^\[/);
  });

  it('gives a link-based email a plain-text fallback for when the button does not render', () => {
    for (const { kind, link } of TEMPLATES) {
      if (link !== '{{ .ConfirmationURL }}') continue;
      const html = read(kind);
      expect(html.split('{{ .ConfirmationURL }}').length - 1).toBeGreaterThanOrEqual(2);
    }
  });

  it('tells a reset email reader what happens if they ignore it', () => {
    expect(read('recovery')).toMatch(/didn.t ask/i);
    expect(read('recovery')).toMatch(/password won.t change/i);
  });
});
