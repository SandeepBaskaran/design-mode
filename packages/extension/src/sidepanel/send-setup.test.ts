import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { localMcpCommand, localMcpConfig, renderSendSetupDialog, sendSetupStep, type SendSetupModel } from './send-setup.ts';

const deps = {
  esc: (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  icon: (name: string) => `<svg data-icon="${name}"></svg>`,
};

function model(over: Partial<SendSetupModel> = {}): SendSetupModel {
  return {
    mode: 'cloud', state: 'offline', statusIssue: '', hasToken: false, cloudUrl: 'https://mcp.designmode.app', localPort: 9960,
    registering: false, checking: false,
    mcpConfig: '{"mcpServers":{"design-mode":{"headers":{"Authorization":"Bearer dm_secret_token"}}}}',
    mcpConfigDisplay: '{"mcpServers":{"design-mode":{"headers":{"Authorization":"Bearer dm_sec…"}}}}',
    localCommand: localMcpCommand(),
    tools: [{ key: 'claude', label: 'Claude Code', path: '.claude/commands/design-mode.md' }],
    changeCount: 2, ...over,
  };
}
const html = (over?: Partial<SendSetupModel>) => renderSendSetupDialog(model(over), deps);

describe('Send to Agent setup dialog', () => {
  it('maps each blocker to its setup step', () => {
    assert.equal(sendSetupStep(model()), 'connect-cloud');
    assert.equal(sendSetupStep(model({ hasToken: true })), 'reconnect');
    assert.equal(sendSetupStep(model({ mode: 'local' })), 'start-local');
    assert.equal(sendSetupStep(model({ state: 'running', hasToken: true })), 'add-agent');
    assert.equal(sendSetupStep(model({ state: 'connected', hasToken: true })), 'ready');
    assert.equal(sendSetupStep(model({ statusIssue: 'restricted_url', hasToken: true })), 'reload-page');
    assert.equal(sendSetupStep(model({ statusIssue: 'no_content_script' })), 'reload-page');
    assert.equal(sendSetupStep(model({ statusIssue: 'auth_token_invalid', hasToken: true })), 'connect-cloud');
  });

  it('cloud_token_missing: connects in place with the existing register action', () => {
    const out = html();
    assert.match(out, /Connect Design Mode to your agent/);
    assert.match(out, /data-dm-action="mcp-cloud-register"/);
    assert.match(out, /Nothing was sent/);
    assert.doesNotMatch(out, /<input/);
  });

  it('self-hosted asks for the server URL inline', () => {
    const out = html({ mode: 'self-hosted', cloudUrl: 'https://relay.example' });
    assert.match(out, /data-dm-setting="cloudUrl"/);
    assert.match(out, /value="https:\/\/relay\.example"/);
  });

  it('shows a progress label while registering', () => {
    const out = html({ registering: true });
    assert.match(out, /Connecting…/);
    assert.match(out, /disabled aria-disabled="true"/);
  });

  it('local_server_offline: exact copyable command and config, port, no MCP page link', () => {
    const out = html({ mode: 'local' });
    assert.match(out, /Start the local Design Mode server/);
    assert.match(out, /port 9960/);
    assert.ok(out.includes('data-dm-payload="' + deps.esc(localMcpCommand()) + '"'));
    assert.match(localMcpCommand(), /^claude mcp add design-mode -- npm start --prefix .*\/packages\/mcp-local$/);
    assert.ok(JSON.parse(localMcpConfig()).mcpServers['design-mode'].args[0] === 'start');
    assert.doesNotMatch(out, /Open MCP settings|data-dm-action="send-agent-help-mcp"/);
  });

  it('transport_inactive: offers a reconnect button', () => {
    const out = html({ hasToken: true });
    assert.match(out, /Reconnect this tab/);
    assert.match(out, /data-dm-action="send-setup-reconnect"/);
  });

  it('no_agent_connected: copies the full config but only displays the masked token', () => {
    const out = html({ state: 'running', hasToken: true });
    assert.match(out, /Add Design Mode to your coding agent/);
    assert.match(out, /Bearer dm_secret_token/);
    const shown = out.slice(out.indexOf('<pre'), out.indexOf('</pre>'));
    assert.doesNotMatch(shown, /dm_secret_token/);
    assert.match(shown, /dm_sec…/);
    assert.match(out, /data-dm-action="copy-agent-command" data-dm-tool="claude"/);
    assert.match(out, /\/design-mode/);
    assert.match(out, /waiting for your agent/);
  });

  it('restricted pages explain what to do without a navigation control', () => {
    const out = html({ statusIssue: 'restricted_url', hasToken: true });
    assert.match(out, /can’t reach this page/);
    assert.match(out, /normal tab/);
  });

  it('send button is only enabled once connected; status turns green', () => {
    const blocked = html();
    assert.match(blocked, /data-dm-action="send-setup-send" disabled aria-disabled="true"/);
    assert.match(blocked, /data-dm-send-setup-status="pending"/);
    const ready = html({ state: 'connected', hasToken: true });
    assert.doesNotMatch(ready, /data-dm-action="send-setup-send" disabled/);
    assert.match(ready, /data-dm-send-setup-status="ok"/);
    assert.match(ready, /var\(--dm-success\)/);
    assert.match(ready, /Send 2 changes now/);
  });

  it('is an accessible modal dialog', () => {
    const out = html();
    assert.match(out, /role="dialog" aria-modal="true" aria-labelledby="dm-send-setup-title" aria-describedby="dm-send-setup-desc"/);
    assert.match(out, /id="dm-send-setup-title"/);
    assert.match(out, /tabindex="-1"/);
    assert.match(out, /<button type="button" data-dm-action="send-setup-close" aria-label="Close"/);
    assert.match(out, /role="status" aria-live="polite"/);
    for (const m of out.matchAll(/<button[^>]*data-dm-action="send-setup-copy"[^>]*>/g)) assert.match(m[0], /aria-label="Copy /);
  });

  it('escapes interpolated values', () => {
    const out = html({ mode: 'self-hosted', cloudUrl: '"><script>alert(1)</script>' });
    assert.doesNotMatch(out, /<script/i);
    assert.match(out, /&lt;script&gt;/);
  });
});
