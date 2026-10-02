import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const relay = readFileSync(new URL('../../../mcp-cloud/api/mcp.ts', import.meta.url), 'utf8');
const content = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
function harness(reply: object = { ok: true }) {
  const sent: any[] = [];
  const responses: any[] = [];
  let mutations = 0;
  let handler: (message: any) => void;
  const context: any = {
    URL, randomBytes: () => ({ toString: () => 'synthetic' }), TOOL_TIMEOUT_MS: 100,
    publishInbound: async (_tenant: string, message: any) => { sent.push(message); },
    awaitResponse: async () => ({ payload: reply }),
    setUnhandledMessageHandler: (callback: typeof handler) => { handler = callback; },
    ensureActiveRoute: async () => {}, getActiveRouteUrl: () => 'https://fixture.test/a?view=one#/panel',
    navigationEpoch: 0, location: { href: 'https://fixture.test/a?view=one#/panel' },
    routeIdentity: (url: string) => ({ url: new URL(url).href }),
    sendRelayResponse: (_id: string, response: any) => { responses.push(response); },
    dispatchCloudMessage: () => { mutations++; },
  };
  const relayAst = ts.createSourceFile('mcp.ts', relay, ts.ScriptTarget.Latest, true);
  const declarations = relayAst.statements.filter(node =>
    ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText() === 'TOOLS') ||
    ts.isFunctionDeclaration(node) && node.name?.text === 'handleToolCall');
  const contentAst = ts.createSourceFile('index.ts', content, ts.ScriptTarget.Latest, true);
  const callbackNode = contentAst.statements.find(node => ts.isExpressionStatement(node)
    && ts.isCallExpression(node.expression) && node.expression.expression.getText(contentAst) === 'setUnhandledMessageHandler');
  assert.ok(callbackNode);
  const callback = callbackNode.getText(contentAst);
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(declarations.map(n => n.getText(relayAst)).join('\n') + '\n' + callback, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return { context, sent, responses, get mutations() { return mutations; },
    deliver: async (message: any) => { handler(message); await new Promise(resolve => setImmediate(resolve)); } };
}

test('cloud apply requires a route and preserves it through the relay boundary', async () => {
  const h = harness();
  for (const routeKey of [undefined, '', 'relative', 'javascript:alert(1)']) {
    const result = await h.context.handleToolCall('synthetic', 'apply_changes', { routeKey, changes: [] });
    assert.equal(result.isError, true);
  }
  assert.equal(h.sent.length, 0);
  const routeKey = 'https://fixture.test/b?view=two#/panel';
  await h.context.handleToolCall('synthetic', 'apply_changes', { routeKey, changes: [{ elementId: 'shared', styles: { color: 'blue' } }] });
  assert.equal(h.sent[0].payload.routeKey, routeKey);
  await h.deliver(h.sent[0]);
  assert.equal(h.mutations, 0);
  assert.match(h.responses[0].error, /Navigate to the requested route/);
});

test('cloud content rejects unscoped apply and accepts only the owning route', async () => {
  const h = harness();
  await h.deliver({ type: 'CLOUD_APPLY_CHANGES', requestId: 'unscoped', payload: { changes: [] } });
  assert.equal(h.mutations, 0);
  assert.match(h.responses[0].error, /routeKey/);
  await h.deliver({ type: 'CLOUD_APPLY_CHANGES', requestId: 'current', payload: { routeKey: h.context.location.href, changes: [] } });
  assert.equal(h.mutations, 1);
});

test('relay reports browser tool errors instead of successful empty exports', async () => {
  const h = harness({ error: 'storage read failed' });
  for (const name of ['export_changes', 'clear_changes', 'get_changes']) {
    const result = await h.context.handleToolCall('synthetic', name, { format: 'css' });
    assert.equal(result.isError, true);
    assert.equal(result.content[0].text, 'Browser error: storage read failed');
  }
});

test('successful cloud exports retain their actual response', async () => {
  const h = harness({ text: '/* Route: A */\nh1 { color: red; }' });
  const result = await h.context.handleToolCall('synthetic', 'export_changes', { format: 'css' });
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0].text, '/* Route: A */\nh1 { color: red; }');
});
