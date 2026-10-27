import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import {
  exportCodeFilename,
  exportMimeType,
  formatExportCount,
  serializeChangesJson,
  summarizeExportPayload,
} from './export-actions';

const source = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('sidepanel.ts', source, ts.ScriptTarget.Latest, true);
const names = ['renderExportCodeView', 'copyExportCode', 'downloadExportCode'];
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name!.text)).map(node => node.getText(ast)).join('\n');
const compiled = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

function payload() {
  return {
    version: 2,
    kind: 'design-mode-changes',
    routeGroups: [
      { url: 'https://example.test/a', styleChanges: [{ selector: 'h1', property: 'color', newValue: '<script>x</script>' }], textChanges: [], domChanges: [], comments: [{ text: 'note' }] },
    ],
    styleChanges: [{ selector: 'h1', property: 'color', newValue: '<script>x</script>' }],
    textChanges: [],
    domChanges: [],
    comments: [{ text: 'note' }],
  };
}

function harness(over: Record<string, unknown> = {}) {
  const state: Record<string, any> = {
    exportCodeTab: 'css',
    exportCodeCss: '.card {\n  color: red;\n}',
    IS_SAFARI: false,
    siteChangesExport: payload(),
    copied: undefined as string | undefined,
    toasts: [] as any[],
    downloads: [] as any[],
    lastBlob: null as Blob | null,
    clipboardHelperResult: true,
    ...over,
  };
  const operation = {
    wait: async (p: any) => p,
    isCurrent: () => true,
  };
  const context = createContext({
    exportCodeTab: state.exportCodeTab,
    exportCodeCss: state.exportCodeCss,
    siteChangesExport: () => state.siteChangesExport,
    summarizeExportPayload,
    serializeChangesJson,
    exportCodeFilename,
    exportMimeType,
    formatExportCount,
    escapeAttr: (s: unknown) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'),
    icon: (name: string) => `<svg data-icon="${name}"></svg>`,
    beginInspectorOperation: () => operation,
    IS_SAFARI: state.IS_SAFARI,
    writeInspectorTextClipboard: (p: Promise<string>) => p.then(() => state.clipboardHelperResult),
    navigator: { clipboard: { async writeText(value: string) { state.copied = value; } } },
    showCaptureToast: (kind: string, text: string) => state.toasts.push([kind, text]),
    document: { createElement: () => ({ href: '', download: '', click() { state.downloads.push({ href: this.href, download: this.download }); }, remove() {} }) },
    URL: { createObjectURL: (b: Blob) => { state.lastBlob = b; return 'blob:test'; }, revokeObjectURL: () => {} },
    Blob,
    setTimeout,
    operation,
  });
  runInContext(compiled, context);
  return { state, context };
}

describe('export code view', () => {
  it('renders a ready CSS preview with selectable content and enabled actions', () => {
    const { context: c } = harness();
    const html = c.renderExportCodeView();
    assert.match(html, /data-dm-action="export-code-tab" data-dm-format="css"/);
    assert.match(html, /data-dm-action="export-code-tab" data-dm-format="json"/);
    assert.match(html, /aria-pressed="true"/);
    assert.match(html, /aria-label="CSS export preview"/);
    assert.match(html, /Copy CSS/);
    assert.match(html, /Download/);
    assert.match(html, /not the page’s full source code/);
    assert.match(html, /tabindex="0"[^>]*user-select:text/);
    assert.match(html, /data-dm-action="back-from-export-code"/);
    assert.match(html, /role="group" aria-label="Export format"/);
  });

  it('escapes page-derived markup inside the CSS preview', () => {
    const { context: c } = harness({ exportCodeCss: '/* <img onerror=x> */\n.card { color: red; }' });
    const html = c.renderExportCodeView();
    assert.doesNotMatch(html, /<img onerror=x>/);
    assert.match(html, /&lt;img onerror=x&gt;/);
  });

  it('shows a pending state while the CSS is being generated and disables the actions', () => {
    const { context: c } = harness({ exportCodeCss: null });
    const html = c.renderExportCodeView();
    assert.match(html, /Preparing CSS…/);
    assert.match(html, /role="status"/);
    assert.match(html, /aria-disabled="true"/);
  });

  it('renders an empty payload as a status message with disabled actions', () => {
    const { context: c } = harness({ siteChangesExport: { version: 2, routeGroups: [], styleChanges: [], textChanges: [], domChanges: [], comments: [] } });
    const html = c.renderExportCodeView();
    assert.match(html, /\(no changes recorded yet\)/);
    assert.match(html, /aria-disabled="true"/);
  });

  it('explains when no style edits exist for a CSS export', () => {
    const { context: c } = harness({ siteChangesExport: { version: 2, routeGroups: [{ url: 'https://example.test/a', styleChanges: [], textChanges: [{ selector: 'h1', newText: 'x' }], domChanges: [], comments: [] }], styleChanges: [], textChanges: [{ selector: 'h1', newText: 'x' }], domChanges: [], comments: [] } });
    const html = c.renderExportCodeView();
    assert.match(html, /No CSS declarations/);
    assert.match(html, /aria-disabled="true"/);
    assert.match(html, /1 change</);
  });

  it('previews JSON with a clear format label and structured-record hint', () => {
    const { context: c } = harness({ exportCodeTab: 'json' });
    const html = c.renderExportCodeView();
    assert.match(html, /aria-label="JSON export preview"/);
    assert.match(html, /Copy JSON/);
    assert.match(html, /Full structured record/);
    assert.doesNotMatch(html, /<script>x<\/script>/);
  });
});

describe('copyExportCode', () => {
  it('copies the generated CSS to the clipboard and reports success', async () => {
    const { state, context: c } = harness();
    const text = await c.copyExportCode();
    assert.equal(text, '.card {\n  color: red;\n}');
    assert.equal(state.copied, '.card {\n  color: red;\n}');
    assert.deepEqual(state.toasts, [['success', 'CSS copied to clipboard']]);
  });

  it('refuses while the CSS is still preparing', async () => {
    const { state, context: c } = harness({ exportCodeCss: null });
    const text = await c.copyExportCode();
    assert.equal(text, null);
    assert.equal(state.copied, undefined);
    assert.deepEqual(state.toasts, [['error', 'CSS is still preparing — try again in a moment']]);
  });

  it('copies the serialized JSON record for the JSON tab', async () => {
    const { state, context: c } = harness({ exportCodeTab: 'json' });
    const text = await c.copyExportCode();
    assert.equal(text, serializeChangesJson(payload()));
    assert.equal(state.copied, serializeChangesJson(payload()));
    assert.deepEqual(state.toasts, [['success', 'Change record copied as JSON']]);
  });

  it('reports a Safari clipboard failure without throwing', async () => {
    const { state, context: c } = harness({ IS_SAFARI: true, clipboardHelperResult: false });
    const text = await c.copyExportCode();
    assert.equal(text, null);
    assert.deepEqual(state.toasts, [['error', 'Could not copy CSS']]);
  });
});

describe('downloadExportCode', () => {
  it('downloads the CSS as a correctly named text/css file', () => {
    const { state, context: c } = harness();
    const filename = c.downloadExportCode();
    assert.match(filename, /^design-mode-changes-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.css$/);
    assert.equal(state.lastBlob?.type, 'text/css');
    assert.equal(state.downloads.length, 1);
    assert.equal(state.downloads[0].download, filename);
    assert.deepEqual(state.toasts, [['success', 'Downloaded ' + filename]]);
  });

  it('downloads the JSON record as application/json', () => {
    const { state, context: c } = harness({ exportCodeTab: 'json' });
    const filename = c.downloadExportCode();
    assert.match(filename, /^design-mode-changes-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/);
    assert.equal(state.lastBlob?.type, 'application/json');
  });

  it('downloads nothing while the CSS is still preparing', () => {
    const { state, context: c } = harness({ exportCodeCss: null });
    const filename = c.downloadExportCode();
    assert.equal(filename, null);
    assert.equal(state.downloads.length, 0);
    assert.deepEqual(state.toasts, [['error', 'CSS is still preparing — try again in a moment']]);
  });
});
