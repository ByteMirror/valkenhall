import { getLocalApiOrigin } from './localApi';

/**
 * Frontend client for the local upscaling endpoint.
 *
 * Contract:
 * - Input: imageUrl (string)
 * - Output: Blob of upscaled PNG (current server returns output.png)
 */

const UPSCALE_ENDPOINT = `${getLocalApiOrigin()}/api/upscale`;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function upscaleImageUrl(imageUrl, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const startedAt = performance.now();
  console.debug('[upscayl] upscaleImageUrl: starting', { imageUrl, endpoint: UPSCALE_ENDPOINT, timeoutMs });

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(new Error('Upscale request timed out')), timeoutMs);

  try {
    const isBlobUrl = typeof imageUrl === 'string' && imageUrl.startsWith('blob:');

    let resp;
    if (isBlobUrl) {
      // blob: URLs are browser-local; we must upload the bytes to the server.
      console.debug('[upscayl] Detected blob: URL; uploading bytes instead of sending imageUrl');
      const blobResp = await fetch(imageUrl);
      const blob = await blobResp.blob();

      const form = new FormData();
      form.append('image', blob, 'input.png');

      resp = await fetch(UPSCALE_ENDPOINT, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
    } else {
      resp = await fetch(UPSCALE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl }),
        signal: controller.signal,
      });
    }

    const elapsedMs = Math.round(performance.now() - startedAt);

    if (!resp.ok) {
      let detailsText = '';
      try {
        detailsText = await resp.text();
      } catch {
        // ignore
      }

      console.error('[upscayl] upscaleImageUrl: failed', {
        status: resp.status,
        statusText: resp.statusText,
        elapsedMs,
        detailsText: detailsText.slice(0, 2000),
        jobId: resp.headers.get('x-upscale-job')
      });

      throw new Error(`Upscale failed (${resp.status} ${resp.statusText}) ${detailsText}`);
    }

    const outBlob = await resp.blob();
    const cacheUrl = resp.headers.get('x-upscale-cache-url') || '';

    console.debug('[upscayl] upscaleImageUrl: success', {
      elapsedMs,
      blobType: outBlob.type,
      blobSize: outBlob.size,
      cacheUrl,
      jobId: resp.headers.get('x-upscale-job'),
      cache: resp.headers.get('x-upscale-cache')
    });

    return { blob: outBlob, cacheUrl };
  } finally {
    clearTimeout(t);
  }
}

export function blobToObjectUrl(blob) {
  const url = URL.createObjectURL(blob);
  console.debug('[upscayl] blobToObjectUrl:', { url, blobType: blob.type, blobSize: blob.size });
  return url;
}

export async function blobToDataUrl(blob) {
  const mimeType = blob?.type || 'application/octet-stream';
  const arrayBuffer = await blob.arrayBuffer();

  if (typeof Buffer !== 'undefined') {
    return `data:${mimeType};base64,${Buffer.from(arrayBuffer).toString('base64')}`;
  }

  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return `data:${mimeType};base64,${btoa(binary)}`;
}
