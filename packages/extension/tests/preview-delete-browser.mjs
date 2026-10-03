import { buildSync } from 'esbuild';
import ts from 'typescript';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = mkdtempSync(resolve(pkg, '.preview-test-'));
const source = process.env.BASELINE_REF
  ? execFileSync('git', ['show', `${process.env.BASELINE_REF}:packages/extension/src/content/index.ts`], { cwd: pkg, encoding: 'utf8' })
  : readFileSync(resolve(pkg, 'src/content/index.ts'), 'utf8');
const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
const cases = [], shortcuts = [];
function visit(node) {
  if (ts.isCaseClause(node) && ["'UNDO'", "'REDO'", "'DOM_ACTION'", "'PREVIEW_ORIGINAL'", "'RESTORE_CHANGES'"].includes(node.expression.getText(ast))) cases.push(node.getText(ast));
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'registerShortcut' && node.arguments[0]?.getText(ast) === "'delete-element'") shortcuts.push(node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
const history = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'onHistoryKeyDown')?.getText(ast) || '';
const command = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'deleteSelectedElements')?.getText(ast) || '';
try {
  const result = buildSync({ stdin: { contents: `
    import { getElementById, getOrAssignId } from './src/content/helpers';
    import { orderDomDeletionTargets } from './src/content/dom-delete';
    import { deleteElements } from './src/content/delete-command';
    import { previewOriginal, restoreOriginalPreview } from './src/content/original-preview';
    import { getDomChanges, getTextChanges, getStyleChanges, applyTextChange, applyHtmlChange, applyAttributeChange, applyStyleChange, setOverridesEnabled, clearAllChanges, recordDomChange } from './src/content/change-tracker';
    import { cutElement, copyElement, pasteElement, duplicateElement, deleteElement, moveElement } from './src/content/html-editor';
    import { setTokenEdit, clearAllTokenEdits } from './src/content/root-var-store';
    const undoStack = [], redoStack = [];
    let selected = null, multi = [];
    const getSelectedElementId = () => selected;
    const setSelectedElementId = id => { selected = id; };
    const getMultiSelectIds = () => multi;
    const isMultiSelectActive = () => !!multi.length;
    const disableMultiSelect = () => { multi = []; };
    const hideSelect = () => {}, showSelect = () => {}, hideCommentPins = () => {}, showCommentPins = () => {};
    const buildElementInfo = el => ({id: el.getAttribute('data-dm-id')});
    const getFullState = () => ({undoCount:undoStack.length, redoCount:redoStack.length});
    const getChangesPayload = async () => ({domChanges:getDomChanges()});
    const notifyPanel = (type,payload) => window.notifications.push({type,payload});
    const clearSelectionToHover = () => { selected = null; notifyPanel('ELEMENT_DESELECTED',{}); };
    const applyTokenUndoValue = () => {};
    import { registerShortcut, enableShortcuts } from './src/content/keyboard-shortcuts';
    import { isTypingTarget } from './src/content/shortcut-binding';
    let on = true; const dmIsActiveInstance = () => true;
    ${history}
    const handleContentMessage = (msg, _, response) => request(msg).then(response);
    if (typeof onHistoryKeyDown !== 'undefined') document.addEventListener('keydown', onHistoryKeyDown, true);
    window.deleteShortcut = () => document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',code:'Delete',bubbles:true,cancelable:true}));
    ${command}
    ${shortcuts.join(';')};
    enableShortcuts();
    function request(msg) { return new Promise(sendResponse => { switch(msg.type) { ${cases.join('\n')} } }); }
    function reset() { restoreOriginalPreview(); clearAllChanges(); clearAllTokenEdits(); undoStack.length=0;redoStack.length=0;selected=null;multi=[]; }
    export { request, reset, setSelectedElementId, getOrAssignId, getDomChanges, getStyleChanges, getTextChanges, applyStyleChange, applyHtmlChange, applyTextChange, applyAttributeChange, recordDomChange, setTokenEdit, moveElement, duplicateElement, undoStack, redoStack };
  `, resolveDir: pkg, loader: 'ts' }, bundle: true, write: false, format: 'iife', globalName: 'Probe', tsconfig: resolve(pkg, 'tsconfig.json') });
  writeFileSync(resolve(fixture, 'bundle.js'), result.outputFiles[0].text);
  writeFileSync(resolve(fixture, 'test.js'), String.raw`
(async () => {
  let checks = 0;
  const check = (v,label) => { checks++; if (!v) throw Error(label); };
  const req = type => Probe.request({type});
  const setup = () => { Probe.reset(); document.querySelector('#fixture').innerHTML='<section id="parent"><button id="a">A</button><button id="b">B</button><button id="c">C</button></section><section id="other"></section>'; };
  const by = id => document.getElementById(id);
  const order = () => Array.from(by('parent').children,e=>e.id).join('');
  try {
    let a, aid;
    if (!window.previewOnly) {
    setup();
    a=by('a'); aid=Probe.getOrAssignId(a); let clicks=0;
    a.addEventListener('click',()=>clicks++);
    Probe.setSelectedElementId(aid); window.deleteShortcut();
    check(!a.isConnected && Probe.undoStack.length===1, 'page Delete records undo');
    document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyZ',metaKey:true,bubbles:true,cancelable:true}));
    await Promise.resolve();
    check(by('a')===a && order()==='abc', 'Delete undo retains original node and sibling location');
    a.click();check(clicks===1, 'Delete undo preserves listener');
    check(Probe.getDomChanges().length===0 && Probe.redoStack.length===1, 'undo removes deletion from Changes');
    await req('REDO');check(!a.isConnected && Probe.getDomChanges().length===1, 'redo updates DOM and Changes');
    await req('UNDO');
    Probe.setSelectedElementId('dm-9999');window.deleteShortcut();
    check(Probe.redoStack.length===1,'failed page Delete retains redo');
    Probe.setSelectedElementId(Probe.getOrAssignId(by('b')));window.deleteShortcut();
    check(Probe.redoStack.length===0, 'new page Delete clears stale redo');
    await Promise.resolve();check(window.notifications.some(n=>n.type==='CHANGES_UPDATE'), 'page Delete notifies panel');
    await req('UNDO');
    const b=by('b');
    await Probe.request({type:'DOM_ACTION',action:'delete',elementIds:[aid,Probe.getOrAssignId(b)]});
    check(order()==='c' && Probe.undoStack.length===1, 'toolbar multi-delete is one command');
    await req('UNDO');check(order()==='abc' && by('a')===a && by('b')===b, 'group undo order and identity');
    await req('REDO');
    const parent=by('parent');parent.remove();const count=Probe.undoStack.length;
    check((await req('UNDO')).ok===false && Probe.undoStack.length===count, 'missing parent refuses undo without losing history');
    by('fixture').prepend(parent);await req('UNDO');
    by('other').append(a);
    check((await req('REDO')).ok===false && a.parentNode===by('other'), 'moved target refuses stale redo');

    setup();a=by('a');aid=Probe.getOrAssignId(a);Probe.setSelectedElementId(aid);
    await Probe.request({type:'DOM_ACTION',action:'cut'});check(!a.isConnected && Probe.undoStack.length===1,'cut shares deletion command');
    await req('UNDO');check(by('a')===a,'cut undo retains node');
    setup();a=by('a');aid=Probe.getOrAssignId(a);
    const cloneId=Probe.duplicateElement(aid), clone=document.querySelector('[data-dm-id="'+cloneId+'"]');
    Probe.applyStyleChange(cloneId,'opacity','0.4');
    Probe.setSelectedElementId(cloneId);window.deleteShortcut();
    check(!Probe.getDomChanges().length && !Probe.getStyleChanges().length, 'delete clone cancels net changes');
    await req('UNDO');check(clone.isConnected && Probe.getDomChanges().length===1 && Probe.getStyleChanges().length===1, 'undo clone deletion restores canceled creation and edits');

    }
    setup();a=by('a');aid=Probe.getOrAssignId(a);const bid=Probe.getOrAssignId(by('b'));
    Probe.setTokenEdit('--accent','red');Probe.applyStyleChange(aid,'opacity','0.4');
    Probe.moveElement(aid,'down');
    Probe.setSelectedElementId(bid);window.deleteShortcut();
    const insertedId=Probe.duplicateElement(Probe.getOrAssignId(by('c')));
    const inserted=document.querySelector('[data-dm-id="'+insertedId+'"]');
    Probe.applyHtmlChange(aid,'<span>edited</span>');const span=a.firstChild;let spanClicks=0;span.addEventListener('click',()=>spanClicks++);
    const edited=by('fixture').innerHTML;
    for(let i=0;i<2;i++) {
      check((await req('PREVIEW_ORIGINAL')).ok, 'preview accepted');
      check(order()==='abc', 'preview reverses move/delete/insertion with nested origin');
      check(getComputedStyle(a).color==='rgb(0, 0, 255)' && getComputedStyle(a).opacity==='1', 'preview removes token and property overrides');
      check(a.textContent==='A' && !inserted.isConnected, 'preview restores original text and detaches insertion');
      const original=by('fixture').innerHTML;await req('PREVIEW_ORIGINAL');check(by('fixture').innerHTML===original, 'repeated preview is idempotent');
      await req('RESTORE_CHANGES');check(by('fixture').innerHTML===edited && a.firstChild===span && inserted.isConnected, 'restore edited DOM and child identity');
      span.click();check(spanClicks===i+1, 'restore listener survives');
      check(getComputedStyle(a).color==='rgb(255, 0, 0)' && getComputedStyle(a).opacity==='0.4', 'restore token and style paint');
      await req('RESTORE_CHANGES');check(by('fixture').innerHTML===edited,'repeated restore is idempotent');
    }
    setup();a=by('a');aid=Probe.getOrAssignId(a);
    const origin={parentSelector:'#parent',index:0};by('other').append(a);
    Probe.recordDomChange(aid,'#a','move','button',undefined,{parentSelector:'#other',index:0},origin);
    await req('PREVIEW_ORIGINAL');check(order()==='abc','cross-parent preview move');await req('RESTORE_CHANGES');check(a.parentNode===by('other'),'cross-parent restore');

    setup();a=by('a');aid=Probe.getOrAssignId(a);
    const parentId=Probe.getOrAssignId(by('parent')), keptParent=by('parent');
    Probe.setSelectedElementId(aid);
    await Probe.request({type:'DOM_ACTION',action:'delete',elementIds:[parentId,aid]});
    check(!keptParent.isConnected,'nested group removed');
    await req('PREVIEW_ORIGINAL');check(by('parent')===keptParent && order()==='abc','nested deleted parents and children preview in place');
    await req('RESTORE_CHANGES');check(!keptParent.isConnected,'nested deletion restore');
    await req('UNDO');check(by('parent')===keptParent && by('a')===a && order()==='abc','nested group undo restores ancestors before children');
    const input=document.createElement('input');document.body.append(input);
    Probe.setSelectedElementId(aid);input.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}));
    check(a.isConnected,'Delete ignores typing target');
    window.deleteShortcut();input.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));
    check(!a.isConnected,'undo ignores typing target');
    document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));
    check(a.isConnected,'Ctrl+Z restores page delete');input.remove();

    setup();a=by('a');aid=Probe.getOrAssignId(a);Probe.setSelectedElementId(aid);window.deleteShortcut();
    Probe.applyStyleChange(Probe.getOrAssignId(by('c')),'opacity','0.6');
    check((await req('UNDO')).ok===false && !a.isConnected && Probe.getStyleChanges().length===1,'intervening unstacked edit refuses destructive snapshot rollback');

    setup();a=by('a');aid=Probe.getOrAssignId(a);Probe.setTokenEdit('--accent','red');
    Probe.recordDomChange('dm-900','#missing','delete','button','<button>deleted</button>',undefined,{parentSelector:'#missing-parent',index:0});
    const before=by('fixture').innerHTML;
    check((await req('PREVIEW_ORIGINAL')).ok===false && by('fixture').innerHTML===before && getComputedStyle(a).color==='rgb(255, 0, 0)', 'missing original location rolls preview back atomically');
    check(!window.__dmPreviewSaved,'failed preview leaves no journal');
    Probe.moveElement(aid,'down');const moved=by('fixture').innerHTML;
    check((await req('PREVIEW_ORIGINAL')).ok===false && by('fixture').innerHTML===moved,'late preview failure rolls back preceding move reversal');
    setup();a=by('a');aid=Probe.getOrAssignId(a);
    const html=a.outerHTML;a.remove();
    Probe.recordDomChange(aid,'#a','delete','button',html,undefined,{parentSelector:'#parent',index:0});
    check((await req('PREVIEW_ORIGINAL')).ok && order()==='abc','persisted deletion reconstructs at origin without a retained node');
    await req('RESTORE_CHANGES');check(order()==='bc','persisted deletion reconstruction removed on restore');
    document.querySelector('#result').textContent='PASS: '+checks+' preview/delete browser checks';
  } catch(error) { document.querySelector('#result').textContent='FAIL: '+error.stack; }
})();
`);
  writeFileSync(resolve(fixture, 'index.html'), `<!doctype html><style>:root{--accent:blue}button{color:var(--accent)}</style><div id="fixture"></div><pre id="result">RUNNING</pre><script>
    window.previewOnly=${process.env.PREVIEW_ONLY === '1'};window.notifications=[];
    const area={get:async()=>({}),set:async()=>{},remove:async()=>{}};
    window.browser={runtime:{id:'fixture',sendMessage:async()=>({ok:true})},storage:{session:area,local:area}};
  </script><script src="bundle.js"></script><script src="test.js"></script>`);
  const run = spawnSync(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless', '--disable-gpu', '--no-first-run', '--disable-background-networking',
    `--user-data-dir=${resolve(fixture, 'profile')}`, '--dump-dom', '--virtual-time-budget=2000', pathToFileURL(resolve(fixture, 'index.html')).href,
  ], {encoding:'utf8',timeout:30000,maxBuffer:3*1024*1024});
  assert.equal(run.status,0,run.error?.message||run.stderr);
  assert.match(run.stdout,/id="result">PASS:/,run.stdout);
  console.log(run.stdout.match(/PASS: [^<]+/)[0]+' (actual message cases/shortcut callback, mocked extension APIs; not installed-extension certification)');
} finally { rmSync(fixture,{recursive:true,force:true}); }
