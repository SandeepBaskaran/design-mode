# @design-mode/mcp-cloud

Hosted multi-tenant MCP server for Design Mode. Deploys to Vercel, relays between
coding agents and the browser extension over Upstash Redis Streams.

## Architecture

```
agent ── HTTPS ──▶ /mcp (Streamable HTTP)
                       │
                       ▼
              Upstash Redis Streams
              inbound:{tenantId}  ──▶ extension
              outbound:{tenantId} ◀── extension
                       ▲
                       │
extension ── SSE ── /extension/stream  (cloud → extension)
extension ── POST ─ /extension/inbox   (extension → cloud)
```

The extension keeps an SSE GET open to `/extension/stream`. When an agent calls
a tool, `/mcp` enqueues onto `inbound:{tenantId}`; the SSE handler short-polls
the stream and forwards new entries as SSE events. The extension responds via
POST to `/extension/inbox`, which enqueues onto `outbound:{tenantId}`; the
awaiting MCP route polls until it sees its `requestId`.

Note on polling: Upstash REST doesn't support XREAD with `BLOCK`, so we
short-poll at ~250ms. Sub-second tool-call latency, modest request count.

## Required services

1. **Upstash Redis** — REST API. Free tier is fine for development.
2. **Vercel KV** — added to the project via the Vercel dashboard. Stores token
   rows (`{ tenantId, token, createdAt, lastSeenAt }`).

Copy `.env.example` → `.env.local` and fill in the values.

## Local development

```bash
npm install
vercel dev
```

Smoke test (with `vercel dev` running on `:3000`):

```bash
# 1. Register an anonymous device token
curl -X POST http://localhost:3000/api/auth/register | jq

# Output: { "token": "dm_…", "tenantId": "…", "mcpUrl": "http://localhost:3000/api/mcp" }

# 2. Open an SSE stream as the extension would
curl -N -H "Authorization: Bearer dm_…" http://localhost:3000/api/extension/stream

# 3. From another shell, list tools as the agent would
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer dm_…" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq
```

## Cost control — daily quota only

The single cost-control lever is a per-tenant **daily tool-call quota**
(default 25, configurable via `DM_DAILY_QUOTA`). One INCR per call against
`quota:{tenantId}:{yyyymmdd}`. Hit the cap and the agent gets a clean MCP
error explaining when it resets.

There is no idle disconnect and no slowed-down polling. Latency stays
sub-second for the calls that go through; only the count is capped.

## Privacy posture

- Stream entries trimmed to `MAXLEN ~100` and `MINID ~60s`.
- Application logs carry `{ tenantId, type, byteCount, latency }` only — never
  selectors, payload bodies, or screenshots. Enforce in code review for any new
  route.
- TLS in production. Tokens always in `Authorization: Bearer …` headers, never
  query strings.
- One-click `/auth/revoke` invalidates the token row and the active SSE stream
  drops on next heartbeat.

## Deferred for v1

- Wake-up channel for closed side panels (today: panel must stay open).
- Email or OAuth sign-in (today: anonymous device tokens).
- Multi-device fan-out (today: last-connection-wins).
