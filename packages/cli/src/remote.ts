import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CliError, loadConfig } from './config.js';

export async function runRemote(
  config: Awaited<ReturnType<typeof loadConfig>>,
  command: string, name: string | undefined, args: Record<string, unknown>,
  emit: (value: unknown) => void,
): Promise<number> {
  const client = new Client({ name: 'designmode-app', version: '0.1.0' });
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const transport = new StreamableHTTPClientTransport(config.url, {
    requestInit: { headers: { authorization: `Bearer ${config.token}` } },
    reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 },
    fetch: async (url, init) => {
      if (new URL(String(url)).href !== config.url.href) throw new Error('Unexpected transport URL');
      const response = await fetch(url, { ...init, redirect: 'error', signal: abort.signal });
      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel();
        throw new CliError('AUTH_FAILED', 'Relay rejected the credential. Check the selected mode and extension token.', 1);
      }
      return response;
    },
  });
  try {
    return await Promise.race([
      (async () => {
        await client.connect(transport, { timeout: config.timeout });
        const tools: Awaited<ReturnType<Client['listTools']>>['tools'] = [];
        const cursors = new Set<string>();
        let cursor: string | undefined;
        do {
          const page = await client.listTools(cursor ? { cursor } : {}, { timeout: config.timeout });
          tools.push(...page.tools);
          cursor = page.nextCursor;
          if (cursor && cursors.has(cursor)) throw new Error('Repeated tool cursor');
          if (cursor) cursors.add(cursor);
          if (tools.length > 10_000 || cursors.size > 100) throw new Error('Tool discovery limit exceeded');
        } while (cursor);
        if (command === 'tools') { emit({ ok: true, mode: config.mode, tools }); return 0; }
        if (command === 'status') {
          emit({ ok: true, mode: config.mode, relay: 'reachable', authenticated: true,
            extensionConnected: null, toolCount: tools.length,
            hint: 'Relay discovery succeeded; browser connection is not verified. Call get_session_summary to request browser state (uses a tool call).',
          });
          return 0;
        }
        const tool = tools.find(item => item.name === name);
        if (!tool) throw new CliError('UNKNOWN_TOOL', 'Unknown tool on this server. Use designmode-app tools to discover supported names.');
        if (command === 'schema') { emit({ ok: true, mode: config.mode, tool }); return 0; }
        const result = await client.callTool({ name: name!, arguments: args }, undefined, { timeout: config.timeout });
        emit({ ok: !result.isError, mode: config.mode, tool: name, result });
        return result.isError ? 1 : 0;
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          reject(new CliError('TIMEOUT', 'Remote command timed out. A mutation may already have happened; inspect state before retrying.', 1));
        }, config.timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    abort.abort();
    await client.close();
  }
}
