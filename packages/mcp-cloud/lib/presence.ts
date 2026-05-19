// ============================================================
// Per-tenant agent presence. Driven by Redis TTL keys so the
// extension's side panel can tell whether an MCP agent has hit
// /api/mcp recently for this tenant. HTTP MCP has no formal
// session close, so we treat "any request within TTL_S" as
// "agent active".
// ============================================================

import { kv } from './kv.js';

const TTL_S = 300; // 5 minutes
const key = (tenantId: string) => `presence:${tenantId}`;

// Mark this tenant as having an active agent. Returns whether this
// was a 0→1 edge (key didn't exist before this call), so the caller
// can decide whether to push an AGENT_PRESENCE event to the
// extension's SSE stream.
export async function bumpPresence(tenantId: string): Promise<boolean> {
  const client = await kv();
  const k = key(tenantId);
  const existed = (await client.exists(k)) === 1;
  await client.set(k, '1', { EX: TTL_S });
  return !existed;
}

// Probe current presence — used by the SSE stream to send the
// initial state and to poll for transitions.
export async function getPresence(tenantId: string): Promise<boolean> {
  const client = await kv();
  return (await client.exists(key(tenantId))) === 1;
}
