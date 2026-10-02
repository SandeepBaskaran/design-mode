import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');
it('labels the style grouping Appearance without changing its filter key', () => {
  assert.ok(source.includes("fchip('style', 'Appearance')"));
  assert.ok(!source.includes("fchip('style', 'Styles')"));
});

const ast = ts.createSourceFile('sidepanel.ts', source, ts.ScriptTarget.Latest, true);
const names = ['panelRouteKey', 'resetChangesRoute', 'currentRouteGroups', 'routeChangeCount', 'siteChangeCount', 'siteChangesExport', 'renderRouteGroups', 'refreshChanges', 'clearAllChanges', 'copyPrompt'];
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name!.text)).map(node => node.getText(ast)).join('\n');
const actions = source.slice(source.indexOf("        case 'open-route':"), source.indexOf("        case 'clear-all-changes':"));
const compiled = ts.transpileModule(functions + '\nasync function action(act, key) { const actionBtn = {dataset: {dmRouteKey:key}}; switch(act) {' + actions + '} }', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

const a = 'https://example.test/a';
const b = 'https://example.test/b?q=1';
function group(url: string, styleChanges: any[] = [], textChanges: any[] = [], comments: any[] = []) {
  return { routeKey: url, url, styleChanges, textChanges, comments, domChanges: [] };
}
function harness() {
  const messages: any[] = [];
  const toasts: any[] = [];
  const context = createContext({
    URL, Map, Set, Date, console, activeRouteKey: a, changesPageUrl: a,
    routeGroups: [group(b, [{ selector: 'h1', property: 'color', oldValue: 'red', newValue: 'blue' }])],
    styleChanges: [{ selector: 'h1', property: 'margin', oldValue: '0', newValue: '8px' }], textChanges: [], domChanges: [], comments: [], tokenChanges: [], componentContexts: {},
    deletingRouteKey: null, changesRequest: 0, myTabId: 7,
    pageGeneration: 0, pageUnavailable: false, pageNavigating: false, routeEditingBlocked: false,
    changesSelected: new Set(), changesGroupCollapsed: new Set(), editedTokens: new Set(), batchAppliedChanges: new Set(),
    clearAllConfirming: false, previewingOriginal: false, changesFilter: 'all', commentsResolvedFilter: 'all', changesStatusFilter: 'all', changesSearch: '',
    escapeAttr: (s: unknown) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'),
    icon: (name: string) => `<svg data-icon="${name}"></svg>`,
    render() {}, refreshDomTree() {}, refreshState() {},
    root: { querySelector() { return null; } }, navigator: { clipboard: { async writeText(value: string) { context.copied = value; } } },
    send: async (message: any) => { messages.push(message); return { success: true, styleChanges: [], comments: [], routeGroups: [] }; },
    showCaptureToast: (...args: any[]) => toasts.push(args),
  });
  runInContext(compiled, context);
  return { context, messages, toasts };
}

describe('site-wide changes panel', () => {
  it('uses origin, pathname and query; ordinary anchors share a route, hash routers do not', () => {
    const { context: c } = harness();
    assert.equal(c.panelRouteKey(a + '#details'), a);
    assert.notEqual(c.panelRouteKey(a + '?mode=2'), a);
    assert.notEqual(c.panelRouteKey(a + '#/settings'), a);
    assert.notEqual(c.panelRouteKey(a + '#!/settings'), a);
    assert.notEqual(c.panelRouteKey('https://other.test/a'), a);
  });

  it('keeps the current route expanded and inactive routes summary-only', () => {
    const { context: c } = harness();
    const html = c.renderRouteGroups('<div>active-renderer</div>');
    assert.ok(html.indexOf(`data-dm-route-group="${a}"`) < html.indexOf(`data-dm-route-group="${b}"`));
    assert.doesNotMatch(html, /toggle-route-group|aria-expanded/);
    assert.match(html, /class="dm-route-action dm-route-current" aria-current="page">Current/);
    assert.match(html, /active-renderer/);
    assert.doesNotMatch(html, /color: red → blue/);
    assert.match(html, /data-dm-action="open-route"/);
    assert.match(html, /aria-label="1 changes"/);
    assert.doesNotMatch(html, />https:\/\/example.test/);
    assert.equal(c.siteChangeCount(), 2);
  });

  it('opens inactive routes only through their explicit navigation action', async () => {
    const { context: c, messages } = harness();
    await c.action('open-route', a);
    assert.equal(messages.length, 0);
    await c.action('open-route', b);
    assert.deepEqual(JSON.parse(JSON.stringify(messages)), [{ type: 'SP_OPEN_ROUTE', routeKey: b, url: b }]);
  });

  it('does not render inactive payloads and escapes route attributes', () => {
    const { context: c } = harness();
    c.routeGroups = [group(b + '\"><img>', [{ selector: '<img onerror=x>', property: 'color', oldValue: 'red', newValue: '<script>x</script>' }], [{ selector: 'h2', oldText: 'old', newText: '<iframe>' }], [{ selector: 'h3', text: '<img src=x>' }])];
    const html = c.renderRouteGroups('active');
    assert.doesNotMatch(html, /<script>|<iframe>|<img/);
    assert.match(html, /&quot;&gt;&lt;img&gt;/);
  });

  it('exports all routes and full URLs regardless of filter or search', () => {
    const { context: c } = harness();
    c.changesFilter = 'comment'; c.changesSearch = 'no match';

    const payload = JSON.parse(JSON.stringify(c.siteChangesExport()));
    assert.equal(payload.version, 2);
    assert.deepEqual(payload.routeGroups.map((g: any) => g.url), [a, b]);
    assert.equal(payload.routeGroups[1].styleChanges[0].newValue, 'blue');
    c.styleChanges = [];
    assert.equal(c.siteChangeCount(), 1);
  });

  it('requires separate delete confirmation and scopes deletion by route', async () => {
    const { context: c, messages } = harness();
    await c.action('confirm-delete-route', b);
    assert.equal(messages.length, 0);
    await c.action('delete-route', b);
    assert.equal(messages.length, 0);

    assert.match(c.renderRouteGroups('active'), /Confirm route deletion/);
    await c.action('cancel-delete-route', b);
    assert.equal(c.deletingRouteKey, null);
    await c.action('delete-route', b);
    await c.action('confirm-delete-route', b);
    assert.equal(messages[0].type, 'SP_CLEAR_ROUTE_CHANGES');
    assert.equal(messages[0].routeKey, b);
    assert.equal(messages[1].type, 'SP_GET_CHANGES');
  });

  it('clears the entire site and reads authoritative state back', async () => {
    const { context: c, messages } = harness();
    await c.clearAllChanges();
    assert.deepEqual(messages.map(m => m.type), ['SP_CLEAR_SITE_CHANGES', 'SP_GET_CHANGES']);
    assert.equal(c.siteChangeCount(), 0);
  });

  it('does not pretend a failed site clear succeeded', async () => {
    const { context: c, toasts } = harness();
    c.send = async () => ({ error: 'storage failed' });
    await c.clearAllChanges();
    assert.equal(c.siteChangeCount(), 2);
    assert.equal(toasts[0][0], 'error');
  });

  it('drops stale refreshes after route and tab changes and out-of-order responses', async () => {
    const { context: c } = harness();
    const pending: ((value: any) => void)[] = [];
    c.send = () => new Promise(resolve => pending.push(resolve));
    const old = c.refreshChanges();
    c.resetChangesRoute(b);
    pending.shift()!({ styleChanges: [{ property: 'stale' }], comments: [] });
    await old;
    assert.equal(c.styleChanges.length, 0);
    const wrongTab = c.refreshChanges(); c.myTabId = 8;
    pending.shift()!({ styleChanges: [{ property: 'wrong-tab' }], comments: [] });
    await wrongTab;
    assert.equal(c.styleChanges.length, 0);
    const oldGeneration = c.refreshChanges(); c.pageGeneration++;
    pending.shift()!({ styleChanges: [{ property: 'old-generation' }], comments: [] });
    await oldGeneration;
    assert.equal(c.styleChanges.length, 0);
    const first = c.refreshChanges(); const second = c.refreshChanges();
    pending[1]({ styleChanges: [{ property: 'latest' }], comments: [] }); await second;
    pending[0]({ styleChanges: [{ property: 'stale' }], comments: [] }); await first;
    assert.equal(c.styleChanges[0].property, 'latest');
  });

  it('requests site-wide prompt output rather than a filtered visible subset', async () => {
    const { context: c, messages } = harness();
    c.send = async (message: any) => { messages.push(message); return { output: `# ${a}\nchange\n# ${b}\nchange` }; };
    await c.copyPrompt();
    assert.equal(messages[0].scope, 'site');
    assert.ok(c.copied.includes(b));
  });
});
