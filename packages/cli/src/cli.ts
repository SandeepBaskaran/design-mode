import { runAgentCli, readArguments, CliError as LocalCliError } from '../../mcp-local/src/agent-cli.js';
import { CliError, loadConfig } from './config.js';
import { runRemote } from './remote.js';

const HELP = `Design Mode agent CLI — Cloud (default), Local, Self-hosted

Usage:
  designmode-app [--mode cloud|local|self-hosted] tools
  designmode-app [--mode cloud|local|self-hosted] schema <tool>
  designmode-app [--mode cloud|local|self-hosted] call <tool> [--stdin]
  designmode-app [--mode cloud|local|self-hosted] status
  designmode-app --help

Help is offline and does not read configuration or credentials.
Mode: --mode overrides DM_MODE, then DM_CONFIG mode; default is Cloud.
Cloud: https://mcp.designmode.app/api/mcp; credential: DM_CLOUD_TOKEN.
Self-hosted: DM_ENDPOINT (full /api/mcp URL), DM_SELF_HOSTED_TOKEN.
Use HTTPS, except HTTP on localhost, 127.0.0.1 or [::1] for local relays.
Credentials: environment or an owned 0600 JSON file selected by DM_CONFIG.
No tokens in argv. See README for the separate cloud / selfHosted profiles.
Remote discovery and status contact the selected relay; status does not claim
browser connectivity. Remote schemas come from that server, not Local's tools.
Local: existing design-mode-mcp owner bridge, DM_PORT (default 9960).
The CLI never starts or replaces the local bridge. Local discovery is offline.
Tool arguments: JSON object via --stdin only (maximum 1 MB).
Commands emit JSON; help is text. Exit codes: 0 success, 1 MCP/transport/tool
failure, 2 usage/config/input, 3 local bridge unavailable, 4 local browser offline.
Remote command deadline: 30 seconds (DM_TIMEOUT_MS: 100..120000); Local calls:
30 seconds. No retries or redirects. A timed-out mutation may have happened;
inspect state before trying again. Tool output may contain sensitive page data.
`;

async function main(argv: string[]): Promise<number> {
  let token: string | undefined;
  const emit = (value: unknown) => {
    let text = JSON.stringify(value);
    if (token) text = text.split(token).join('[REDACTED]');
    process.stdout.write(`${text}\n`);
  };
  try {
    if (!argv.length || (argv.length === 1 && ['--help', '-h', 'help'].includes(argv[0]))) {
      process.stdout.write(HELP);
      return 0;
    }
    let mode: string | undefined;
    if (argv[0] === '--mode') { mode = argv[1]; argv = argv.slice(2); }
    const [command, name, flag] = argv;
    if (!((['tools', 'status'].includes(command) && argv.length === 1) ||
      (command === 'schema' && argv.length === 2) ||
      (command === 'call' && (argv.length === 2 || (argv.length === 3 && flag === '--stdin'))))) {
      throw new CliError('USAGE', 'Use --help for supported commands. Credentials and tool arguments are never accepted in argv.');
    }
    const config = await loadConfig(mode);
    token = config.token;
    if (config.mode === 'local') return await runAgentCli(argv);
    const args = flag === '--stdin' ? await readArguments(process.stdin) : {};
    return await runRemote(config, command, name, args, emit);
  } catch (error) {
    const known = error instanceof CliError;
    const inputError = error instanceof LocalCliError && error.code === 'INVALID_ARGUMENTS';
    emit({ ok: false, error: {
      code: known ? error.code : inputError ? 'INVALID_ARGUMENTS' : 'CALL_FAILED',
      message: known ? error.message : inputError ? error.message : 'MCP request failed. Check the relay, credential and schema. A mutation may already have happened; inspect state before retrying.',
    } });
    return known ? error.exitCode : inputError ? 2 : 1;
  }
}

main(process.argv.slice(2)).then(code => { process.exitCode = code; }, () => {
  process.stdout.write('{"ok":false,"error":{"code":"INTERNAL_ERROR","message":"Unable to complete the CLI request."}}\n');
  process.exitCode = 1;
});
