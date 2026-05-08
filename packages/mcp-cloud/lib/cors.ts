// ============================================================
// Design Mode Cloud — CORS helpers.
// The browser extension's content script fetches /api/extension/*
// from third-party page origins (https://example.com etc.) and from
// the chrome-extension:// origin. Both are cross-origin to
// mcp.designmode.app, so every route must answer preflight + return
// the appropriate Allow-* headers on real responses.
// ============================================================

const ALLOW_ORIGIN = '*';
const ALLOW_HEADERS = 'Authorization, Content-Type';
const ALLOW_METHODS = 'GET, POST, OPTIONS';
const MAX_AGE = '600'; // 10 min preflight cache

export function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': ALLOW_METHODS,
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Max-Age': MAX_AGE,
  };
}

// Empty 204 for preflight. Every route should call this from its
// OPTIONS handler.
export function preflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// Wrap an existing Response to add the CORS headers in place.
export function withCors(resp: Response): Response {
  const headers = new Headers(resp.headers);
  for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v as string);
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
}
