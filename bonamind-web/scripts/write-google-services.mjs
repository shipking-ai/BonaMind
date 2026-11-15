/**
 * Writes android/app/google-services.json from the GOOGLE_SERVICES_JSON
 * secret, for the Play release build.
 *
 * The file is kept out of the public repo, and app/build.gradle applies the
 * Google services plugin only when it exists, so a build without it ships
 * with push silently off. This step makes that visible:
 *
 *   - secret unset        -> a ::warning:: and exit 0 (the release still
 *                            builds, without push)
 *   - not JSON, or no
 *     client for the app's
 *     applicationId       -> exit 1, nothing written (push would never
 *                            register, and the build would look fine)
 *   - otherwise           -> the file is written; its contents are never
 *                            printed
 *
 * Usage: node scripts/write-google-services.mjs [--out <path>] [--gradle <path>]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const out = arg('--out', resolve(appDir, 'android/app/google-services.json'));
const gradle = arg('--gradle', resolve(appDir, 'android/app/build.gradle'));

function fail(message) {
  console.log(`::error::${message}`);
  process.exit(1);
}

const secret = process.env.GOOGLE_SERVICES_JSON ?? '';
if (secret.trim() === '') {
  console.log(
    '::warning::GOOGLE_SERVICES_JSON is not set, so this build has no push notifications. ' +
      'See HANDOFF.md, "Push sender", for the Firebase steps.',
  );
  process.exit(0);
}

let config;
try {
  config = JSON.parse(secret);
} catch {
  fail('GOOGLE_SERVICES_JSON is not valid JSON. Paste the whole google-services.json file from Firebase.');
}

const appId = /applicationId\s+"([^"]+)"/.exec(readFileSync(gradle, 'utf8'))?.[1];
if (!appId) fail(`No applicationId found in ${gradle}.`);

const packages = (config.client ?? []).map((c) => c?.client_info?.android_client_info?.package_name);
if (!packages.includes(appId)) {
  fail(
    `google-services.json has no Android app for ${appId} (it has: ${packages.join(', ') || 'none'}). ` +
      `In Firebase, add an Android app with package name ${appId} and download its file again.`,
  );
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, secret);
console.log(`Wrote google-services.json for ${appId} (Firebase project ${config.project_info?.project_id ?? 'unknown'}).`);
