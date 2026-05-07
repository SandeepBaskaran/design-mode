# @design-mode/mcp-cloud

Hosted multi-tenant MCP server for Design Mode. Deploys to Vercel and uses
**Vercel KV only** for storage — no Upstash, no separate Redis to provision.

## Architecture

```
agent ── HTTPS ──▶ /mcp (Streamable HTTP)
                       │
                       ▼
                  Vercel KV
                  inbound:{tenantId}    list   (cloud → extension)
                  resp:{requestId}      key    (extension → cloud reply)
                  tok:{tokenHash}       key    (anonymous device tokens)
                  quota:{tenantId}:{ymd}  counter (per-day quota)
                       ▲
                       │
extension ── SSE ── /extension/stream  (cloud → extension push)
extension ── POST ─ /extension/inbox   (extension → cloud reply)
```

The extension keeps an SSE GET open to `/extension/stream`. When an agent calls
a tool, `/mcp` writes the request to `inbound:{tenantId}` (Redis-style list);
the SSE handler short-polls the list and forwards each entry as an SSE event.
The extension replies via POST to `/extension/inbox`, which writes the JSON
under `resp:{requestId}` with a 60 s TTL; the awaiting MCP route polls that
key until it appears.

Polling cadence: ~250 ms. Sub-second end-to-end tool-call latency.

## Required services

1. **Vercel KV** — added to the project via the Vercel dashboard's Storage tab.
   Auto-injects all `KV_*` env vars into the project. That's it.

Copy `.env.example` → `.env.local` and fill in the values for local dev.

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
