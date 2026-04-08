// Shared PNG → WebP conversion for card art.
//
// Single source of truth for how Valkenhall converts card images.
// Both code paths that pull card art from the Sorcery CDN — on-demand
// fetches via handleSorceryImage, and the first-run bulk downloader
// via downloadBatch — route through convertPngBufferToWebp below so
// encoder settings live in exactly one place.
//
// Design notes:
//
//   * The upstream Sorcery CDN only serves PNGs. All conversion happens
//     server-side on the user's machine as card images are fetched.
//     The converted WebP is the only copy persisted to disk; the PNG
//     from the CDN is held only long enough to run sharp on the buffer.
//
//   * Quality 85 / effort 4 is the sweet spot for painted card art. At
//     this setting WebP is visually indistinguishable from the source
//     PNG but ~85-90 % smaller. Higher effort (5-6) shaves ~5 % more
//     off the file size at 2-3x the CPU cost per image — not worth it
//     for one-time conversion that happens during download anyway.
//
//   * Sharp uses libvips internally which is multithreaded per call,
//     so letting multiple conversions run concurrently (as downloadBatch
//     does with CONCURRENCY=8 workers) still benefits from shared thread
//     pool reuse. We don't serialize conversions.

import sharp from 'sharp';

// Encoder settings — tune here, propagate everywhere. Bumping quality
// up to 90 is safe if we ever see visible compression artifacts on
// specific card art. Dropping to 80 would save another ~15 % at the
// cost of visible banding on smooth gradients, so don't.
export const WEBP_QUALITY = 85;
export const WEBP_EFFORT = 4;

// File extension used for cached card images on disk. Centralized so
// the filesystem layout and the HTTP routing layer can agree without
// copy-pasting string literals.
export const CARD_IMAGE_EXT = '.webp';
export const CARD_IMAGE_CONTENT_TYPE = 'image/webp';

/**
 * Convert a PNG buffer to a WebP buffer using the shared quality
 * settings. Throws if sharp fails (corrupt PNG, unsupported format,
 * OOM) — callers should catch and surface as a download failure.
 */
export async function convertPngBufferToWebp(pngBuffer) {
  return await sharp(pngBuffer)
    .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
    .toBuffer();
}
