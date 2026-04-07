// Local API runs on the same origin as the renderer — relative URLs only.
// The renderer server's port changes per launch but that's fine because
// all fetches use root-relative paths that resolve against the current origin.

export function getLocalApiOrigin() {
  return '';
}

export const LOCAL_API_ORIGIN = '';

/**
 * Resolve a card image URL to a root-relative path.
 *
 * Card instances shared by remote players in multiplayer sessions may carry
 * absolute URLs with the other player's local port. Strip any `http(s)://host:port`
 * prefix so the image loads from the current origin.
 */
export function resolveLocalImageUrl(url) {
  if (!url) return '';
  return url.replace(/^https?:\/\/[^/]+/, '');
}
