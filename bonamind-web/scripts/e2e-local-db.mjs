/**
 * Builds BonaMind's schema in a LOCAL Supabase (`supabase start`) so the
 * seeded Playwright specs can mint throwaway accounts without touching the
 * live project.
 *
 * Applies, in order:
 *   1. supabase/schema.sql      — baseline dump of the public schema
 *   2. supabase/migrations/     — every migration, merged chronologically with
 *   3. supabase/migrations-extra/  (the same order run-migrations.js uses)
 *
 * Migrations are idempotent, so replaying ones the baseline already contains
 * is a no-op; any error stops the run (ON_ERROR_STOP), because a migration
 * that cannot apply to a fresh database is a bug worth seeing.
 *
 * SQL goes through `docker exec ... psql` on the local stack's database
 * container, so it needs no psql install and cannot reach a remote database.
 *
 * Usage: node scripts/e2e-local-db.mjs [--container supabase_db_bonamind-e2e]
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const flag = argv.indexOf('--container');
const container = flag >= 0 ? argv[flag + 1] : 'supabase_db_bonamind-e2e';

function psql(sql, label) {
  try {
    execFileSync(
      'docker',
      ['exec', '-i', container, 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'],
      { input: sql, stdio: ['pipe', 'ignore', 'pipe'], maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (err) {
    const detail = err.stderr ? err.stderr.toString().trim() : err.message;
    console.error(`✖ ${label}\n${detail}`);
    process.exit(1);
  }
  console.log(`✔ ${label}`);
}

const baseline = readFileSync(join(repoRoot, 'supabase/schema.sql'), 'utf8');
if (!/CREATE TABLE/i.test(baseline)) {
  console.error('supabase/schema.sql has no tables; the local database cannot be built without it.');
  process.exit(1);
}
psql(baseline, 'schema.sql');

const dirs = ['supabase/migrations', 'supabase/migrations-extra'];
const files = dirs
  .flatMap((dir) =>
    readdirSync(join(repoRoot, dir))
      .filter((name) => name.endsWith('.sql'))
      .map((name) => ({ name, path: join(repoRoot, dir, name) })),
  )
  .sort((a, b) => a.name.localeCompare(b.name));

for (const file of files) psql(readFileSync(file.path, 'utf8'), file.name);

// PostgREST caches the schema at start; tell it about the new tables.
psql("NOTIFY pgrst, 'reload schema';", 'reload PostgREST schema cache');
console.log(`Local database ready: baseline + ${files.length} migrations.`);
