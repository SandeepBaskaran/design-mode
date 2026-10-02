import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from './mcp-server.js';
import { probeOwnerHealth, proxyToolCall } from './owner-bridge.js';

const HELP = `Design Mode local agent CLI

Usage:
  designmode-app --mode local tools                 List MCP tools and input schemas (offline)
  designmode-app --mode local schema <tool>         Show one MCP tool's schema (offline)
  designmode-app --mode local call <tool>           Invoke with an empty argument object
  designmode-app --mode local call <tool> --stdin   Read a JSON argument object from stdin
  designmode-app --mode local status                Check the existing local bridge
  designmode-app --help

DM_PORT selects the loopback bridge port (default 9960).
Start the existing design-mode-mcp server in your MCP client, then select
Local mode in the browser extension. This CLI never starts or replaces it.
All commands except help emit one JSON object on stdout. Errors use nonzero
exit codes: 1 tool failure, 2 usage, 3 bridge unavailable, 4 extension offline.
Calls time out after 30 seconds and are never retried. A timed-out mutation
may already have happened; inspect state before trying again.
Pass potentially sensitive arguments via stdin, never command-line arguments.
`;

export class CliError extends Error {
  constructor(readonly code: string, message: string, readonly exitCode: number) {
    super(message);
  }
}

export async function readArguments(input: AsyncIterable<string | Buffer>): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of input) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new CliError('INVALID_ARGUMENTS', 'JSON input exceeds 1000000 bytes.', 2);
    chunks.push(buffer);
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new CliError('INVALID_ARGUMENTS', 'Stdin must contain valid JSON. Input was not echoed.', 2);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CliError('INVALID_ARGUMENTS', 'Tool arguments must be a JSON object.', 2);
  }
  return value as Record<string, unknown>;
}

export async function runAgentCli(
  argv: string[],
  input: AsyncIterable<string | Buffer> = process.stdin,
  write: (text: string) => void = text => { process.stdout.write(text); },
): Promise<number> {
  const emit = (value: unknown) => write(`${JSON.stringify(value)}\n`);
  let client: Client | undefined;
  let server: ReturnType<typeof createMcpServer> | undefined;
  try {
    if (argv.length === 0 || (argv.length === 1 && ['--help', '-h', 'help'].includes(argv[0]))) {
      write(HELP);
      return 0;
    }
    const [command, name, flag] = argv;
    if (!((['tools', 'status'].includes(command) && argv.length === 1) ||
      (command === 'schema' && argv.length === 2) ||
      (command === 'call' && (argv.length === 2 || (argv.length === 3 && flag === '--stdin'))))) {
      throw new CliError('USAGE', 'Use --help for supported commands. Tool arguments are accepted only via --stdin.', 2);
    }
    const portText = process.env.DM_PORT ?? '9960';
    const port = Number(portText);
    if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new CliError('INVALID_PORT', 'DM_PORT must be an integer between 1 and 65535.', 2);
    }
    if (command === 'status') {
      const health = await probeOwnerHealth(port);
      emit({ ok: Boolean(health?.extensionConnected), bridge: health ? 'running' : 'unavailable',
        port, extensionConnected: Boolean(health?.extensionConnected),
        ...(health ? { version: health.version, pid: health.pid } : {}),
        ...(!health ? { hint: 'Start design-mode-mcp in your MCP client. Check DM_PORT.' } :
          !health.extensionConnected ? { hint: 'Open Design Mode in the browser and select Local mode.' } : {}),
      });
      return !health ? 3 : health.extensionConnected ? 0 : 4;
    }
    let dispatchError: CliError | undefined;
    server = createMcpServer(async (tool, args, extra) => {
      const health = await probeOwnerHealth(port);
      if (!health) dispatchError = new CliError('BRIDGE_UNAVAILABLE', 'Start design-mode-mcp in your MCP client. Check DM_PORT.', 3);
      else if (!health.extensionConnected && tool !== 'get_session_summary') {
        dispatchError = new CliError('EXTENSION_OFFLINE', 'Open Design Mode in the browser and select Local mode. No tool was dispatched.', 4);
      }
      if (dispatchError) throw dispatchError;
      return proxyToolCall(port, tool, args, extra);
    });
    client = new Client({ name: 'designmode-app', version: '0.1.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    if (command === 'tools') {
      emit({ ok: true, tools });
      return 0;
    }
    const tool = tools.find(tool => tool.name === name);
    if (!tool) throw new CliError('UNKNOWN_TOOL', 'Unknown tool. Use designmode-app --mode local tools to discover supported names.', 2);
    if (command === 'schema') {
      emit({ ok: true, tool });
      return 0;
    }
    const args = flag === '--stdin' ? await readArguments(input) : {};
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 30_000 });
    if (dispatchError) throw dispatchError;
    emit({ ok: !result.isError, tool: name, result });
    return result.isError ? 1 : 0;
  } catch (error) {
    const known = error instanceof CliError;
    emit({ ok: false, error: { code: known ? error.code : 'CALL_FAILED',
      message: known ? error.message : 'MCP request failed. Check the bridge and tool schema; a mutation may already have happened.' } });
    return known ? error.exitCode : 1;
  } finally {
    await client?.close();
    await server?.close();
  }
}
