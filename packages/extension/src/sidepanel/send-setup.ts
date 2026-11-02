// ============================================================
// Design Mode — "Finish setup" dialog for Send to Agent
// ============================================================
//
// Send to Agent only sends when a coding agent is really connected. When it
// isn't, the panel shows this dialog instead of sending: it says in plain
// words what is missing and gives the exact fix in place (a connect button,
// a copyable command or config). Nothing here navigates away from the panel.
//
// Pure functions only (state in, HTML string out) so the content per blocker
// is unit-testable without a DOM. sidepanel.ts owns the state, focus handling
// and the live re-check.

import { sendToAgentBlock } from '../platform/analytics';

export type SendSetupMode = 'local' | 'cloud' | 'self-hosted';
export type SendSetupState = 'offline' | 'running' | 'connected';
export type SendSetupStep = 'connect-cloud' | 'start-local' | 'reconnect' | 'reload-page' | 'add-agent' | 'ready';

export interface SendSetupTool { key: string; label: string; path: string }

export interface SendSetupModel {
  mode: SendSetupMode;
  state: SendSetupState;
  /** Error code from the last status probe ('' when none). */
  statusIssue: string;
  hasToken: boolean;
  cloudUrl: string;
  localPort: number;
  registering: boolean;
  checking: boolean;
  /** MCP config JSON for the current mode, already containing the token. */
  mcpConfig: string;
  /** What is shown for mcpConfig (token masked). */
  mcpConfigDisplay: string;
  localCommand: string;
  tools: SendSetupTool[];
  changeCount: number;
}

export interface SendSetupDeps {
  esc: (value: string) => string;
  icon: (name: any, size?: number) => string;
}

const PAGE_ISSUES = ['no_content_script', 'restricted_url', 'tab_closed', 'cross_origin_iframe'];

/** Which setup step the user is on. `ready` means a real send can go out. */
export function sendSetupStep(m: Pick<SendSetupModel, 'mode' | 'state' | 'statusIssue' | 'hasToken'>): SendSetupStep {
  const block = sendToAgentBlock(m.state, m.mode, m.hasToken, m.statusIssue);
  if (!block) return 'ready';
  const code = block.error_code || '';
  if (code === 'no_agent_connected') return 'add-agent';
  if (PAGE_ISSUES.includes(code)) return 'reload-page';
  if (code === 'cloud_token_missing' || code === 'auth_token_invalid') return m.mode === 'local' ? 'start-local' : 'connect-cloud';
  if (m.mode === 'local') return 'start-local';
  return m.hasToken ? 'reconnect' : 'connect-cloud';
}

export const LOCAL_REPO_PLACEHOLDER = '/path/to/design-mode';

export function localMcpCommand(): string {
  return 'claude mcp add design-mode -- npm start --prefix ' + LOCAL_REPO_PLACEHOLDER + '/packages/mcp-local';
}

export function localMcpConfig(): string {
  return JSON.stringify({
    mcpServers: { 'design-mode': { command: 'npm', args: ['start'], cwd: LOCAL_REPO_PLACEHOLDER + '/packages/mcp-local' } },
  }, null, 2);
}

function statusText(m: SendSetupModel, step: SendSetupStep): { dot: string; text: string; ok: boolean } {
  if (m.checking) return { dot: 'var(--dm-yellow)', text: 'Checking…', ok: false };
  if (step === 'ready') return { dot: 'var(--dm-success)', text: 'Connected — your agent is ready', ok: true };
  if (step === 'add-agent') {
    return { dot: 'var(--dm-yellow)', text: (m.mode === 'local' ? 'Local server is running' : 'Relay is connected') + ' — waiting for your agent', ok: false };
  }
  return { dot: 'var(--dm-danger)', text: 'Not connected yet', ok: false };
}

const BTN = 'padding:6px 10px;border-radius:6px;font-size:11px;font-family:inherit;cursor:pointer;';
const BTN_SECONDARY = BTN + 'background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);color:var(--dm-text);';
const BTN_PRIMARY = BTN + 'background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);color:var(--dm-accent);font-weight:600;';

export function renderSendSetupDialog(m: SendSetupModel, deps: SendSetupDeps): string {
  const { esc, icon } = deps;
  const step = sendSetupStep(m);
  const status = statusText(m, step);

  const code = (t: string) => '<code style="font-family:SF Mono,Monaco,monospace;font-size:10px;background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:3px;padding:1px 4px;word-break:break-all;">' + esc(t) + '</code>';
  const p = (html: string) => '<p style="margin:0;font-size:11px;line-height:1.55;color:var(--dm-text-secondary);">' + html + '</p>';
  const copyBlock = (label: string, shown: string, payload: string) =>
    '<div style="display:flex;flex-direction:column;gap:4px;">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
    '<span style="font-size:11px;font-weight:600;color:var(--dm-text);">' + esc(label) + '</span>' +
    '<button type="button" data-dm-action="send-setup-copy" data-dm-payload="' + esc(payload) + '" aria-label="Copy ' + esc(label) + '" style="' + BTN_SECONDARY + 'display:inline-flex;align-items:center;gap:4px;">' + icon('copy', 11) + ' Copy</button>' +
    '</div>' +
    '<pre tabindex="0" aria-label="' + esc(label) + '" style="margin:0;padding:8px;background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;font-family:SF Mono,Monaco,monospace;font-size:10px;line-height:1.5;color:var(--dm-text);white-space:pre-wrap;word-break:break-all;max-height:150px;overflow:auto;">' + esc(shown) + '</pre>' +
    '</div>';
  const stepList = (items: string[]) =>
    '<ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:11px;line-height:1.55;color:var(--dm-text-secondary);">' +
    items.map(i => '<li>' + i + '</li>').join('') + '</ol>';
  const switchMode = (to: SendSetupMode, label: string) =>
    '<button type="button" data-dm-mcp-mode="' + to + '" style="background:none;border:none;padding:0;color:var(--dm-accent);font-size:11px;font-family:inherit;cursor:pointer;text-decoration:underline;align-self:flex-start;">' + esc(label) + '</button>';

  let title = '';
  let intro = '';
  let body = '';

  if (step === 'connect-cloud') {
    const selfHosted = m.mode === 'self-hosted';
    const rejected = m.statusIssue === 'auth_token_invalid';
    title = rejected ? 'Reconnect Design Mode to your agent' : 'Connect Design Mode to your agent';
    intro = rejected
      ? 'The server did not accept this browser’s device token, so nothing was sent. Create a new one below.'
      : 'Send to Agent needs a one-time connection between this browser and your coding agent. Nothing was sent.';
    body =
      (selfHosted
        ? '<label style="display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:600;color:var(--dm-text);">Server URL' +
          '<input type="text" id="dm-send-setup-cloud-url" class="dm-input" data-dm-setting="cloudUrl" value="' + esc(m.cloudUrl) + '" placeholder="https://your-server.example" style="padding:6px 8px;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:6px;color:var(--dm-text);font-size:11px;font-family:inherit;font-weight:400;"></label>'
        : '') +
      p('Click <b>Connect</b> to create a device token. It stays in this browser. Then you’ll copy a short config into your agent.') +
      '<button type="button" data-dm-action="mcp-cloud-register" data-dm-setup-autofocus ' + (m.registering ? 'disabled aria-disabled="true" ' : '') + 'style="' + BTN_PRIMARY + 'align-self:flex-start;' + (m.registering ? 'opacity:.6;cursor:default;' : '') + '">' + (m.registering ? 'Connecting…' : (rejected ? 'Create a new token' : 'Connect to ' + (selfHosted ? 'server' : 'Cloud'))) + '</button>' +
      switchMode('local', 'Use a local server on this computer instead');
  } else if (step === 'start-local') {
    title = 'Start the local Design Mode server';
    intro = 'Local mode talks to a small server on your computer (port ' + m.localPort + '), and it isn’t running. Nothing was sent.';
    body =
      p('Run this once in a terminal to register the server with Claude Code. Replace ' + code(LOCAL_REPO_PLACEHOLDER) + ' with the folder where you cloned Design Mode.') +
      copyBlock('Terminal command', m.localCommand, m.localCommand) +
      stepList([
        'Start your agent. It launches the server for you.',
        'Press <b>Re-check</b> below. This window turns green when the server is up.',
      ]) +
      '<details style="font-size:11px;color:var(--dm-text-secondary);"><summary style="cursor:pointer;color:var(--dm-text);">Using another agent?</summary>' +
      '<div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">' +
      p('Add this to your agent’s MCP settings instead.') +
      copyBlock('MCP config', m.mcpConfigDisplay, m.mcpConfig) + '</div></details>' +
      switchMode('cloud', 'Use Cloud instead (nothing to run locally)');
  } else if (step === 'reconnect') {
    title = 'Reconnect this tab';
    intro = 'You’re set up, but this tab isn’t connected to the relay right now. Nothing was sent.';
    body =
      p('Press <b>Reconnect</b>. If it stays red, check your internet connection or the server URL.') +
      '<button type="button" data-dm-action="send-setup-reconnect" data-dm-setup-autofocus style="' + BTN_PRIMARY + 'align-self:flex-start;">Reconnect</button>';
  } else if (step === 'reload-page') {
    const restricted = m.statusIssue === 'restricted_url';
    title = 'Design Mode can’t reach this page';
    intro = restricted
      ? 'Browsers don’t let extensions run on this kind of page, so nothing was sent.'
      : 'Design Mode isn’t attached to this tab yet, so nothing was sent.';
    body = restricted
      ? stepList(['Open the site you’re editing in a normal tab (not <b>chrome://</b>, the Web Store or a PDF).', 'Press <b>Re-check</b> below.'])
      : stepList(['Reload the page you’re editing (<b>Cmd/Ctrl + R</b>).', 'Press <b>Re-check</b> below.']);
  } else if (step === 'add-agent') {
    title = 'Add Design Mode to your coding agent';
    intro = (m.mode === 'local' ? 'The local server is running' : 'The relay is connected') + ', but no coding agent is using it yet. Nothing was sent.';
    body =
      stepList([
        'Copy the config below and paste it into your agent’s MCP settings (Claude Code, Cursor, Windsurf, …).',
        'Restart the agent, then run ' + code('/design-mode') + ' in it (save that command first — see below).',
        'This window turns green as soon as the agent connects.',
      ]) +
      copyBlock('MCP config', m.mcpConfigDisplay, m.mcpConfig) +
      '<details style="font-size:11px;color:var(--dm-text-secondary);"><summary style="cursor:pointer;color:var(--dm-text);">First time? Save the /design-mode command</summary>' +
      '<div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">' +
      p('Copy it, then save it as a file in your project at the path shown for your agent.') +
      m.tools.map(t =>
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
        '<span style="font-size:11px;color:var(--dm-text);">' + esc(t.label) + ' ' + code(t.path) + '</span>' +
        '<button type="button" data-dm-action="copy-agent-command" data-dm-tool="' + esc(t.key) + '" aria-label="Copy command for ' + esc(t.label) + '" style="' + BTN_SECONDARY + 'flex-shrink:0;">Copy</button></div>'
      ).join('') + '</div></details>';
  } else {
    title = 'Ready to send';
    intro = m.changeCount > 0
      ? 'Your agent is connected. Send ' + m.changeCount + ' change' + (m.changeCount === 1 ? '' : 's') + ' now.'
      : 'Your agent is connected.';
    body = p('Press <b>Send to Agent</b>. The agent implements your changes and marks each one done in the Changes tab.');
  }

  const canSend = step === 'ready';
  return '<div data-dm-send-setup-backdrop style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:60;display:flex;align-items:center;justify-content:center;">' +
    '<div role="dialog" aria-modal="true" aria-labelledby="dm-send-setup-title" aria-describedby="dm-send-setup-desc" data-dm-send-setup data-dm-send-setup-step="' + step + '" tabindex="-1" style="background:var(--dm-bg);border:1px solid var(--dm-separator-strong);border-radius:10px;padding:14px;width:320px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto;box-shadow:0 8px 24px rgba(0,0,0,0.3);display:flex;flex-direction:column;gap:10px;outline:none;">' +
    '<div style="display:flex;align-items:flex-start;gap:8px;">' +
    '<span style="display:flex;color:var(--dm-accent);margin-top:2px;" aria-hidden="true">' + icon('send', 14) + '</span>' +
    '<h2 id="dm-send-setup-title" style="margin:0;flex:1;font-size:13px;font-weight:600;line-height:1.35;color:var(--dm-text);">' + esc(title) + '</h2>' +
    '<button type="button" data-dm-action="send-setup-close" aria-label="Close" style="background:none;border:none;padding:2px;color:var(--dm-text-secondary);cursor:pointer;display:flex;">' + icon('x', 14) + '</button>' +
    '</div>' +
    '<p id="dm-send-setup-desc" style="margin:0;font-size:11px;line-height:1.55;color:var(--dm-text-secondary);">' + esc(intro) + '</p>' +
    body +
    '<div role="status" aria-live="polite" data-dm-send-setup-status="' + (status.ok ? 'ok' : 'pending') + '" style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;font-size:11px;color:var(--dm-text);">' +
    '<span aria-hidden="true" style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:' + status.dot + ';"></span><span>' + esc(status.text) + '</span></div>' +
    '<div style="display:flex;gap:6px;">' +
    '<button type="button" data-dm-action="send-setup-recheck" style="' + BTN_SECONDARY + 'flex:1;">Re-check</button>' +
    '<button type="button" data-dm-action="send-setup-send" ' + (canSend ? '' : 'disabled aria-disabled="true" ') + 'style="' + BTN_PRIMARY + 'flex:1;' + (canSend ? '' : 'opacity:.5;cursor:default;') + '">Send to Agent</button>' +
    '</div></div></div>';
}
