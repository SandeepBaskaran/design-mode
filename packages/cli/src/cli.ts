import { runAgentCli } from '../../mcp-local/src/agent-cli.js';

runAgentCli(process.argv.slice(2)).then(
  code => { process.exitCode = code; },
  () => {
    process.stdout.write(`${JSON.stringify({ ok: false, error: {
      code: 'INTERNAL_ERROR', message: 'Unable to complete the CLI request.',
    } })}\n`);
    process.exitCode = 1;
  },
);
