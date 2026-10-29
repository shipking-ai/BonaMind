/**
 * avatarService — client-side helpers for the user's profile avatar.
 *
 * Why a service module instead of inlining in SettingsPage:
 *   - Compression (canvas) and validation (file-type sniff) are non-trivial
 *     and worth keeping next to other one-shot-only operations.
 *   - We want to swap this out cleanly when we add cloud-side transcoding
 *     via a Supabase Edge Function.
 *
 * RLS for the avatars bucket is enforced by migration
 * 20260722110000_avatar_storage.sql. We never construct a service-role key
 * client-side; the user's session JWT is what carries through to
 * supabase.storage.
 */
import { supabase } from '../database/supabase';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MiB
// GIF and SVG are exempt from canvas-compression because:
//   - GIF transparency palette can be lost under canvas reencode.
//   - SVG is vector — there is no raster to resize.
const COMPRESSION_EXEMPT = new Set(['image/gif', 'image/svg+xml']);
const ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
  'image/svg+xml', 'image/gif', 'image/avif',
]);

export type UploadResult =
  | { readonly ok: true; url: string; path: string; bytes: number }
  | { readonly ok: false; error: string };

interface CompressionResult {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Browser-side compression for raster images. We resize to a 256-px
 * square (longest edge), then reencode as WebP at 0.86 quality. For
 * avatars this trades a few pixels of detail for a 5-15× reduction in
 * bytes — well worth it on metered mobile networks.
 *
 * Returns the original blob untouched if the mime is exempt (gif/svg)
 * or if the browser can't get a 2D context.
 */
async function compressRaster(file: File): Promise<CompressionResult> {
  if (COMPRESSION_EXEMPT.has(file.type)) {
    return { blob: file, width: 0, height: 0 };
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { blob: file, width: 0, height: 0 };
  }
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return { blob: file, width: 0, height: 0 };
  const MAX = 256;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { blob: file, width: 0, height: 0 };
  ctx.drawImage(bitmap, 0, 0, w, h);
  // canvas.toBlob preserves the original mime if it accepts reencoding
  // (PNG/WebP/JPEG). AVIF is not universally canvas-encodable; we let
  // it pass through as-is if toBlob rejects.
  const blob: Blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/webp',
      0.86,
    );
  }).catch(() => file);
  return { blob, width: w, height: h };
}

/**
 * Validate a picked File:
 *   - mime type fits our allowed list;
 *   - byte size fits within MAX_BYTES;
 *
 * Throws with a user-friendly message on mismatch.
 */
function validate(file: File): void {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error(
      `That file type (${file.type || 'unknown'}) isn't supported. ` +
      `Try PNG, JPG, WEBP, GIF, or SVG.`,
    );
  }
  if (file.size > MAX_BYTES) {
    throw new Error(
      `That's over 5 MB (${(file.size / 1024 / 1024).toFixed(1)} MB). ` +
      `Pick a smaller image.`,
    );
  }
}

/** Deterministically derive an extension from MIME so uploading the same
 *  file twice overwrites the canonical path instead of leaving orphans. */
function extFromMime(mime: string): string {
  if (mime === 'image/svg+xml') return 'svg';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/avif') return 'avif';
  return 'bin';
}

/**
 * Upload `file` to the avatars bucket at `avatars/{user_id}/profile.{ext}`.
 * Returns the public URL on success. The bucket is configured
 * `public=TRUE` so the URL is readable without a signed token.
 */
export async function uploadAvatar(file: File, userId: string): Promise<UploadResult> {
  try {
    validate(file);
  } catch (e) {
    return { ok: false, error: (e as Error).message } as const;
  }
  if (!supabase) {
    return { ok: false, error: 'Supabase client unavailable' } as const;
  }
  const { blob } = await compressRaster(file);
  const ext = extFromMime(file.type);
  const path = `${userId}/profile.${ext}`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, blob, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type,
    });
  if (error) {
    return { ok: false, error: error.message } as const;
  }
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return {
    ok: true,
    url: data.publicUrl,
    path,
    bytes: blob.size,
  } as const;
}

/** Delete the user's existing avatar object. Idempotent. */
export async function deleteAvatar(userId: string): Promise<UploadResult> {
  if (!supabase) return { ok: false, error: 'Supabase client unavailable' };
  // Try each extension in case the user uploaded before this fix
  // introduced extFromMime() determinism.
  const candidates = ['gif', 'svg', 'webp', 'png', 'jpg', 'avif'];
  for (const ext of candidates) {
    await supabase.storage.from('avatars').remove([`${userId}/profile.${ext}`]);
  }
  return { ok: true, url: '', path: `${userId}/profile`, bytes: 0 };
}
