import ts from 'typescript';
import { createInspectorOperation } from './inspector-operation';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { commandOutcome, messageFeatures } from '../platform/analytics.ts';

const source = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('sidepanel.ts', source, ts.ScriptTarget.Latest, true);
const functions = ast.statements.filter(n => ts.isFunctionDeclaration(n) && ['send', 'applyHtml'].includes(n.name!.text)).map(n => n.getText(ast)).join('\n');
const compiled = ts.transpile(functions, { target: ts.ScriptTarget.ES2022 });

for (const response of [{ info: {} }, { ok: false }, null, 'throw']) {
  test(`modern rich-text command uses text telemetry, response=${JSON.stringify(response)}`, async () => {
    const events: unknown[] = [];
    const commands: unknown[] = [];
    const context = vm.createContext({
      IS_SAFARI: false, beginInspectorOperation: () => createInspectorOperation(() => 0, false), messageFeatures, commandOutcome, myTabId: 42,
      info: null, styleChanges: [], textChanges: [], domChanges: [], undoCount: 0, redoCount: 0,
      render() {}, trackFeature(event: unknown) { events.push(event); },
      browser: { runtime: { async sendMessage(message: unknown) {
        commands.push(message);
        if (response === 'throw') throw Error('unavailable');
        return response;
      } } },
    });
    await vm.runInContext(compiled + '\napplyHtml("synthetic-element", "<b>Private page text</b>")', context);
    assert.deepEqual(JSON.parse(JSON.stringify(commands)), [{type: 'SP_SET_HTML', elementId: 'synthetic-element', html: '<b>Private page text</b>', targetTabId: 42}]);
    const outcome = response === 'throw' ? { outcome: 'failure', reason: 'unavailable' } : commandOutcome(response);
    assert.deepEqual(JSON.parse(JSON.stringify(events)), [{feature:'text', outcome:'attempt'}, {feature:'text', ...outcome}]);
    assert.equal(JSON.stringify(events).includes('Private'), false);
    assert.equal(JSON.stringify(events).includes('synthetic-element'), false);
  });
}
