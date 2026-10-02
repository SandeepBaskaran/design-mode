import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

for (const paintBeforeTeardown of [false, true]) {
  test(`teardown cancels resize without committing (paint settled: ${paintBeforeTeardown})`, async () => {
    const listeners = new Map<string, Function>();
    const frames = new Map<number, Function>();
    const previews: string[] = [];
    const commits: unknown[] = [];
    let resolvePaint!: () => void;
    const painted = new Promise<void>(resolve => { resolvePaint = resolve; });
    let selectionPaints = 0;
    const rect = { top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100 };
    const node = (): any => ({ style: {}, children: [], appendChild() {}, replaceChildren() {}, remove() {} });
    const dependencies: Record<string, unknown> = {
      '../shared': { Z_INDEX: {} },
      './authored-sizing': { inspectAuthoredSizing: () => ({ width: { authored: '100px' }, height: { authored: '100px' } }) },
      './user-styles': { setUserStylePreview: (css: string) => previews.push(css), whenUserStylesPainted: () => painted, userOverrideScope: () => '' },
      './helpers': { getElementRect: () => rect },
      './overlays': { showSelect: () => selectionPaints++, setOverlayTransitions() {} },
    };
    const exports: any = {};
    const source = readFileSync(new URL('./measure-guides.ts', import.meta.url), 'utf8');
    vm.runInNewContext(ts.transpileModule(source + '\nexports.startResize = startResize;', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      exports, require: (name: string) => dependencies[name],
      document: { createElement: node, documentElement: node(), addEventListener: (name: string, fn: Function) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) },
      window: { innerWidth: 500, innerHeight: 500, getComputedStyle: () => ({ boxSizing: 'border-box' }) },
      CSS: { escape: (s: string) => s },
      requestAnimationFrame: (fn: Function) => { frames.set(1, fn); return 1; },
      cancelAnimationFrame: (id: number) => frames.delete(id),
    });
    exports.setResizeCommitHandler((...args: unknown[]) => commits.push(args));
    exports.startResize({ dataset: { dmId: 'target' }, getBoundingClientRect: () => rect }, 'se', { clientX: 0, clientY: 0 });
    listeners.get('mousemove')!({ clientX: 20, clientY: 20 });
    assert.match(previews.at(-1)!, /width:120px!important/);
    if (paintBeforeTeardown) { resolvePaint(); await painted; }
    const paints = selectionPaints;
    exports.teardownMeasureGuides();
    resolvePaint(); await painted;
    assert.equal(exports.isResizing(), false);
    assert.equal(listeners.size, 0);
    assert.equal(frames.size, 0);
    assert.equal(previews.at(-1), '');
    assert.equal(selectionPaints, paints);
    assert.deepEqual(commits, []);
  });
}
