#!/usr/bin/env node
/**
 * ============================================================================
 * DESIGN MODE MCP SERVER — MASTER ORCHESTRATOR
 * ============================================================================
 * Pure Node.js bootstrapper that:
 * 1. Boots the WebSocket server for browser extension bridge
 * 2. Starts the MCP Server on stdio for coding agent communication
 * 3. Prints beautiful terminal output with connection instructions
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from '../mcp-server.js';
import { startWebSocketServer, isExtensionConnected } from '../websocket-server.js';

const DEFAULT_WS_PORT = 9960;
const VERSION = '1.6.0';

// ANSI color helpers (using stderr since stdout is for MCP stdio)
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

const log = (...args: any[]) => console.error(...args);

async function boot() {
  const port = parseInt(process.env.DM_PORT || String(DEFAULT_WS_PORT), 10);

  log('');
  log(`\ud83d\ude80 Starting ${bold('Design Mode MCP')} v${VERSION}...`);
  log('');

  // 1. Start WebSocket server for browser extension communication
  try {
    await startWebSocketServer(port);
    log(`  ${green('\u2713')} WebSocket server listening on ${cyan(`ws://localhost:${port}`)}`);
  } catch (error: any) {
    log(`  ${red('\u2717')} WebSocket server failed: ${error.message}`);
    if (error.message?.includes('already in use')) {
      log(`  ${yellow('\u21b3')} Fix: run ${cyan(`lsof -ti:${port} | xargs kill -9`)} then try again`);
      log(`  ${yellow('\u21b3')} Or use a different port: ${cyan(`DM_PORT=9961 npm start`)}`);
    }
    process.exit(1);
  }

  // 2. Start MCP server on stdio for coding agent communication
  try {
    const mcpServer = createMcpServer();
    const transport = new StdioServerTransport();

    log(`  ${green('\u2713')} MCP server initializing on ${cyan('stdio')} transport`);
    log('');

    log(`==================================================`);
    log(`${green('\u2705')} ${bold('DESIGN MODE MCP READY')}`);
    log(`==================================================`);
    log('');
    log(`${bold('\ud83d\udd0c MCP CLIENT CONFIG')} ${dim('(for Cursor, Claude Desktop, etc.)')}`);
    log('');
    log(cyan(JSON.stringify({
      "design-mode": {
        command: "npm",
        args: ["start"],
        cwd: process.cwd().replace(/\/packages\/mcp-local$/, ''),
      }
    }, null, 2)));
    log('');
    log(`${bold('\ud83d\udce1 EXTENSION BRIDGE')}`);
    log(`  WebSocket: ${cyan(`ws://localhost:${port}`)}`);
    log(`  Status:    ${yellow('Waiting for browser extension...')}`);
    log('');
    log(`${bold('\ud83d\udee0  AVAILABLE MCP TOOLS')}`);
    log(`  ${dim('\u2022')} get_changes         ${dim('\u2014 All edits + comments + ready-to-paste CSS block')}`);
    log(`  ${dim('\u2022')} apply_changes       ${dim('\u2014 Push CSS to the browser (single change or batch)')}`);
    log(`  ${dim('\u2022')} set_change_status   ${dim('\u2014 Mark changes/comments todo | in_progress | resolved')}`);
    log(`  ${dim('\u2022')} clear_changes       ${dim('\u2014 Reset the session')}`);
    log(`  ${dim('\u2022')} get_session_summary ${dim('\u2014 Status, sessions, counts')}`);
    log(`  ${dim('\u2022')} export_changes      ${dim('\u2014 Emit as css | tailwind | scss | jsx')}`);
    log(`  ${dim('\u2022')} get_screenshot      ${dim('\u2014 PNG of the page or a specific element (unique path)')}`);
    log('');
    log(`==================================================`);
    log(`Watching for incoming agent requests...`);
    log(`Press ${bold('CTRL+C')} to stop.`);
    log(`==================================================`);
    log('');

    // Monitor extension connection
    let notified = false;
    const connectionCheck = setInterval(() => {
      if (!notified && isExtensionConnected()) {
        log(`  ${green('\u2713')} Browser extension connected!`);
        notified = true;
        clearInterval(connectionCheck);
      }
    }, 2000);
    connectionCheck.unref();

    await mcpServer.connect(transport);
  } catch (error) {
    log(`  ${red('\u2717')} Failed to start MCP server:`, error);
    process.exit(1);
  }
}

// Cleanup handlers
process.on('SIGINT', () => {
  log('\n\ud83d\uded1 Shutting down Design Mode MCP...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});

boot();
