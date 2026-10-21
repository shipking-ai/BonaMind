#!/usr/bin/env node
/**
 * Checks the real initial-load JS payload for the built app.
 *
 * Reads dist/index.html and sums the gzipped size of every JS asset the
 * browser downloads at startup: the module entry script plus all
 * modulepreload links. Lazy chunks (route pages, vendor-webllm, etc.) are
 * excluded — they only load on demand, so they are not part of first paint.
 *
 * This replaced the size-limit config, whose esbuild-based measurement
 * followed static imports and glob-summed every vendor chunk (including
 * the lazy WebLLM runtime), reporting ~2.9 MB where the browser actually
 * downloads ~430 KB. The number that matters is what index.html loads.
 *
 * Usage:
 *   node scripts/check-bundle-size.mjs [budget-kb]
 *   BUNDLE_SIZE_BUDGET_KB=500 node scripts/check-bundle-size.mjs
 *
 * Default budget: 500 KB gzipped. Exit code 1 when exceeded.
 */
import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const budgetKb = Number(process.argv[2] ?? process.env.BUNDLE_SIZE_BUDGET_KB ?? 500);

if (!Number.isFinite(budgetKb) || budgetKb <= 0) {
  console.error(`Invalid budget: ${budgetKb}`);
  process.exit(1);
}

const html = readFileSync(join(root, 'dist', 'index.html'), 'utf8');

// Entry <script src> + <link rel="modulepreload" href> for JS only.
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
if (assets.length === 0) {
  console.error('No JS assets found in dist/index.html — run `npm run build` first.');
  process.exit(1);
}

let total = 0;
const rows = [...new Set(assets)]
  .map((href) => {
    const file = join(root, 'dist', href.replace(/^\//, ''));
    const raw = readFileSync(file);
    const gz = gzipSync(raw).length;
    total += gz;
    return { href, raw: raw.length, gz };
  })
  .sort((a, b) => b.gz - a.gz);

for (const { href, raw, gz } of rows) {
  console.log(`${(gz / 1024).toFixed(1).padStart(8)} KB gzip  ${(raw / 1024).toFixed(0).padStart(6)} KB raw  ${href}`);
}
console.log('─'.repeat(64));
const totalKb = total / 1024;
console.log(`Initial JS payload: ${totalKb.toFixed(1)} KB gzipped (budget ${budgetKb} KB)`);

if (totalKb > budgetKb) {
  console.error(`✗ Budget exceeded by ${(totalKb - budgetKb).toFixed(1)} KB`);
  process.exit(1);
}
console.log('✓ Within budget');
