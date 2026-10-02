import { buildSync } from 'esbuild';
import ts from 'typescript';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = mkdtempSync(resolve(pkg, '.import-test-'));
const source = readFileSync(resolve(pkg, 'src/content/index.ts'), 'utf8');
const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
const buildPayload = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'buildChangesPayload').getText(ast);
const revert = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'revertAllPageMutations').getText(ast);
let importCase;
function visit(node) {
  if (ts.isCaseClause(node) && node.expression.getText(ast) === "'IMPORT_CHANGES'") importCase = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(importCase);
try {
  const result = buildSync({ stdin: { contents: `
    import { restoreOriginalPreview } from './src/content/original-preview';
    import { validateImportPayload } from './src/content/import-validation';
    import { captureImportDomRollback } from './src/content/import-transaction';
    import { applyChangesPayload, applyStyleChange, getStyleChanges, getTextChanges, getDomChanges, clearAllChanges, setOverridesEnabled, captureTrackerRollback, persistImportedSession, persistSession, loadSession, requestStopFeedback } from './src/content/change-tracker';
    import { getElementById } from './src/content/helpers';
    import { setTokenEdit, getTokenEdits, clearAllTokenEdits, captureTokenRollback } from './src/content/root-var-store';
    const undoStack = ['old-undo'], redoStack = ['old-redo'];
    let importInProgress = false;
    import { getPageComments, persistPageComments, renderPageComments, captureCommentPinsRollback, showAllPins } from './src/content/comments';
    const clearAllLayoutGuides = () => {};
    const getChangeComponentContexts = () => {
      if (window.failAfterMutation) { window.failAfterMutation = false; throw Error('late failure'); }
      return {};
    };
    ${buildPayload}
    ${revert}
    async function request(payload) {
      return new Promise(sendResponse => { const msg = {payload}; switch ('IMPORT_CHANGES') { ${importCase} } });
    }
    export { persistImportedSession, persistSession, loadSession, showAllPins, request, applyChangesPayload, applyStyleChange, getStyleChanges, getTextChanges, getDomChanges, setTokenEdit, getTokenEdits, undoStack, redoStack, revertAllPageMutations, validateImportPayload };
  `, resolveDir: pkg, loader: 'ts' }, bundle: true, write: false, format: 'iife', globalName: 'Probe', tsconfig: resolve(pkg, 'tsconfig.json') });
  writeFileSync(resolve(fixture, 'bundle.js'), result.outputFiles[0].text);
  writeFileSync(resolve(fixture, 'test.js'), String.raw`
(async () => {
  let checks = 0;
  const check = (value, label) => { checks++; if (!value) throw Error(label); };
  const empty = () => ({styleChanges:[],textChanges:[],domChanges:[],comments:[]});
  const base = {id:'test',elementId:'dm-1',selector:'#a',timestamp:1};
  const text = (oldText,newText) => ({...base,oldText,newText,isHtml:true});
  const style = (newValue,state) => ({...base,property:'color',oldValue:'black',newValue,state});
  try {
    Probe.applyChangesPayload({...empty(),textChanges:[text('original','<b>existing</b>')]});
    Probe.setTokenEdit('--accent','red');
    window.durableComments = [{...base,id:'comment',text:'original comment',updatedAt:1,pageUrl:location.href}];
    await Probe.showAllPins();
    const oldPin = document.querySelector('.dm-comment-pin');
    check(oldPin, 'existing comment pin');
    window.__dmPreviewSaved = {sentinel:true};
    const original = document.querySelector('#a');
    const before = () => JSON.stringify({html:original.outerHTML,styles:Probe.getStyleChanges(),texts:Probe.getTextChanges(),tokens:Probe.getTokenEdits(),undo:Probe.undoStack,redo:Probe.redoStack,comments:durableComments,preview:window.__dmPreviewSaved});
    const snapshot = before();
    const unsafe = [
      '<img src="data:image/png;base64,AA==" onerror="document.documentElement.dataset.executed=1">',
      '<a href="java&#x09;script:document.documentElement.dataset.executed=1">link</a>',
      '<svg><animate attributeName="href" values="javascript:alert(1)"/></svg>',
      '<iframe srcdoc="<script>document.documentElement.dataset.executed=1</script>"></iframe>',
      '<x-custom></x-custom>', '<div is="custom-div"></div>',
      '<math><mtext><img src=x onerror="document.documentElement.dataset.executed=1"></mtext></math>',
      '<template><img src=x onerror="document.documentElement.dataset.executed=1"></template>',
    ];
    for (const html of unsafe) {
      for (const record of [text('',html),text(html,'safe')]) {
        const writesBefore = writes;
        const r = await Probe.request({...empty(),textChanges:[record]});
        check(r.ok === false, 'reject active old/new HTML');
        check(writes === writesBefore && before() === snapshot, 'HTML rejected before all mutation');
      }
      for (const action of ['insert','duplicate','delete']) {
        const r = await Probe.request({...empty(),domChanges:[{...base,action,tagName:'DIV',outerHTML:html,destination:{parentSelector:'#parent',index:0},origin:{parentSelector:'#parent',index:0}}]});
        check(r.ok === false && before() === snapshot, 'outerHTML sibling sink ' + action);
      }
    }
    const malformed = [null,{}, {...empty(),styleChanges:[null]}, {...empty(),textChanges:[{...text('','ok'),elementId:'bad"] #b {'}]}, {...empty(),styleChanges:[{...style('red'),selector:'['}]}, {...empty(),domChanges:[{...base,action:'move',tagName:'DIV',destination:{parentSelector:'#parent',index:-1}}]}, {...empty(),comments:[{...base,text:'comment',updatedAt:1,pageUrl:'',region:{x:0,y:0,w:-1,h:20}}]}, {...empty(),textChanges:[{...text('','ok'),timestamp:'oops'}]}, {...empty(),styleChanges:[style('red',':hover, #b')]}, {...empty(),textChanges:Array(5001).fill(text('','ok'))}, {...empty(),extra:'x'.repeat(5*1024*1024)}];
    for (const payload of malformed) {
      const writesBefore = writes;
      const r = await Probe.request(payload);
      check(r.ok === false && writes === writesBefore && before() === snapshot, 'malformed before mutation ' + String(r.error));
    }
    window.failComments = true;
    check((await Probe.request(empty())).ok === false && before() === snapshot, 'comment write failure retains session');
    window.failComments = false;
    window.failSession = true;
    check((await Probe.request(empty())).ok === false && before() === snapshot, 'mid-write session failure rolls back comments');
    window.failSession = false;
    window.failAfterMutation = true;
    check((await Probe.request(empty())).ok === false && before() === snapshot, 'late failure restores DOM trackers tokens history preview');
    check(document.querySelector('#a') === original, 'rollback retains element identity/listeners');
    check(document.querySelectorAll('.dm-comment-pin').length === 1 && document.querySelector('.dm-comment-pin') === oldPin, 'rollback retains original pin exactly once');
    await Probe.showAllPins();
    check(document.querySelectorAll('.dm-comment-pin').length === 1, 'restored pin map remains consistent');
    check(!document.documentElement.dataset.executed, 'no benign event handler executed');

    for (const state of [undefined,':hover','@starting']) {
      const r = await Probe.request({...empty(),styleChanges:[style('red; } #b { opacity: 0.123; } /*',state)]});
      check(r.ok === true, 'CSS invalid value is inert');
      check(getComputedStyle(document.querySelector('#b')).opacity === '1', 'CSS value cannot break out ' + state);
    }
    for (const state of ['', ':hover', '@starting']) {
      Probe.applyStyleChange('dm-1','color','red; } #b { opacity: 0.123; } /*',undefined,undefined,state);
      check(getComputedStyle(document.querySelector('#b')).opacity === '1', 'agent/live apply value is CSSOM isolated ' + state);
    }
    check(Probe.applyStyleChange('dm-1','color','red',undefined,undefined,':hover, #b') === null, 'agent selector suffix rejected');
    check(Probe.applyStyleChange('dm-1','color; } #b {opacity','0.123') === null, 'agent property breakout rejected');
    let threw = false;
    try { Probe.setTokenEdit('--accent','red',':root {} #b {opacity:.123} /*'); } catch { threw=true; }
    check(threw && getComputedStyle(document.querySelector('#b')).opacity === '1', 'token scope breakout rejected');
    const markup = '<section class="card" data-layout="grid"><table><tbody><tr><td>cell</td></tr></tbody></table><svg viewBox="0 0 10 10"><path d="M0 0L10 10" /></svg><img alt="photo" src="data:image/png;base64,AA=="><a href="/docs"><strong>docs</strong></a></section>';
    const r = await Probe.request({...empty(),textChanges:[text('<i>old</i>',markup)],styleChanges:[{...style('calc(10px + 2px)'),id:'width',property:'width'}]});
    check(r.ok === true && original.querySelector('table td').textContent === 'cell' && original.querySelector('svg path') && original.querySelector('a').getAttribute('href') === '/docs', 'passive exported structure survives');
    check(getComputedStyle(original).width === '12px', 'complex CSS works');
    check(Probe.getTokenEdits().length === 0 && Probe.undoStack.length === 0 && Probe.redoStack.length === 0 && !window.__dmPreviewSaved, 'replacement clears obsolete tokens/history/preview');
    Probe.revertAllPageMutations();
    check(original.innerHTML === '<i>old</i>', 'validated old HTML reverts correctly');
    const inserted = {...base,id:'insert',elementId:'dm-3',selector:'#inserted',action:'insert',tagName:'DIV',outerHTML:'<div id="inserted"><b>safe</b></div>',destination:{parentSelector:'#parent',index:1}};
    check((await Probe.request({...empty(),domChanges:[inserted]})).ok && document.querySelector('#inserted b'), 'safe DOM reconstruction');
    Probe.revertAllPageMutations();
    check(!document.querySelector('#inserted'), 'safe DOM reconstruction revert');
    const deleted = {...base,id:'delete',elementId:'dm-2',selector:'#b',action:'delete',tagName:'DIV',outerHTML:'<div id="b" data-dm-id="dm-2">sibling</div>',origin:{parentSelector:'#parent',index:1}};
    check((await Probe.request({...empty(),domChanges:[deleted]})).ok && !document.querySelector('#b'), 'safe delete replay');
    Probe.revertAllPageMutations();
    check(document.querySelector('#parent').children[1].id === 'b', 'safe deleted outerHTML reverts at original sibling position');
    const legacy = {...base,id:'legacy',text:'legacy comment',pageUrl:location.href};
    check((await Probe.request({...empty(),comments:[legacy]})).ok && durableComments[0].updatedAt === 1, 'legacy comment normalized through handler');
    for (const updatedAt of [null, '1', -1]) {
      check(!(await Probe.request({...empty(),comments:[{...legacy,updatedAt}]})).ok, 'supplied malformed updatedAt rejected');
    }
    await Probe.persistImportedSession(empty());
    check((await Probe.loadSession()).styleChanges.length === 0, 'promise storage load');
    window.failRead = true;
    check(await Probe.loadSession() === null, 'promise storage read rejection');
    window.failRead = false;
    window.failSession = true;
    let rejected = false;
    try { await Probe.persistImportedSession(empty()); } catch { rejected = true; }
    check(rejected, 'promise storage write rejection');
    Probe.persistSession();
    await new Promise(resolve => setTimeout(resolve, 150));
    window.failSession = false;

    // Persistence yields to the host page; rollback must retain intervening edits.
    const savedHistory = JSON.stringify([Probe.undoStack, Probe.redoStack]);
    window.onSessionWrite = () => {
      document.querySelector('#b').textContent = 'website intervening edit';
      window.failAfterMutation = true;
    };
    check(!(await Probe.request(empty())).ok, 'late synchronous commit failure');
    check(document.querySelector('#b').textContent === 'website intervening edit', 'late rollback retains website edit during await');
    check(JSON.stringify([Probe.undoStack, Probe.redoStack]) === savedHistory, 'late failure retains undo and redo history');
    window.onSessionWrite = () => {
      Probe.applyStyleChange('dm-1','opacity','0.7');
      Probe.undoStack.push('intervening-undo');
    };
    const stale = await Probe.request(empty());
    check(!stale.ok && /Session changed/.test(stale.error), 'stale import rejected after live extension edit');
    check(Probe.getStyleChanges().some(c => c.property === 'opacity') && Probe.undoStack.at(-1) === 'intervening-undo', 'live tracker and undo retained');
    check(Object.values(window.durableSession)[0].styleChanges.some(c => c.property === 'opacity'), 'rollback persists live session not stale snapshot');

    const host = document.createElement('div'); host.id = 'move-host';
    const other = document.createElement('div'); other.id = 'move-other';
    document.body.append(host, other);
    for (const [from,to,cross] of [[0,1,false],[2,0,false],[0,2,false],[1,0,true]]) {
      host.innerHTML = '<i id="m0"></i><i id="m1"></i><i id="m2"></i>'; other.replaceChildren();
      const source = host.children[from];
      const move = {...base,id:'move',elementId:'dm-900',selector:'#'+source.id,action:'move',tagName:'I',origin:{parentSelector:'#move-host',index:from},destination:{parentSelector:cross?'#move-other':'#move-host',index:to}};
      const expected = Array.from(host.children).map(c => c.id); expected.splice(from,1); if (!cross) expected.splice(to,0,source.id);
      Probe.applyChangesPayload({...empty(),domChanges:[move]});
      const exported = JSON.parse(JSON.stringify(Probe.getDomChanges()));
      check(Array.from(host.children).map(c=>c.id).join() === expected.join(), 'move final-index ordering');
      host.innerHTML = '<i id="m0"></i><i id="m1"></i><i id="m2"></i>'; other.replaceChildren();
      Probe.applyChangesPayload({...empty(),domChanges:exported});
      check(Array.from(host.children).map(c=>c.id).join() === expected.join() && (!cross || other.firstElementChild.id === source.id), 'export and replay move ordering');
    }
    host.remove(); other.remove();
    const first = Probe.request(empty());
    const concurrent = await Probe.request(empty());
    check(concurrent.ok === false && /already in progress/.test(concurrent.error), 'concurrent import rejected without racing replacement');
    check((await first).ok === true, 'first concurrent import completes');
    document.body.insertAdjacentHTML('beforeend','<pre id="result">PASS: '+checks+' import security browser checks</pre>');
  } catch (error) {
    document.body.insertAdjacentHTML('beforeend','<pre id="result"></pre>');
    document.querySelector('#result').textContent = 'FAIL: '+error.stack;
  }
})();
  `);
  const polyfill = readFileSync(createRequire(import.meta.url).resolve('webextension-polyfill/dist/browser-polyfill.js'), 'utf8');
  writeFileSync(resolve(fixture, 'polyfill.js'), polyfill);
  for (const mode of ['native', 'polyfill-local', 'polyfill-session']) {
  writeFileSync(resolve(fixture, 'index.html'), `<!doctype html><body><div id="parent"><div id="a">original</div><div id="b">sibling</div></div><script>
    window.writes=0;window.durableComments=[];
    const runtime={id:'fixture',lastError:null,sendMessage:async msg=>{if(msg.type==='COMMENT_STORE'){if(msg.operation.kind==='replacePage'){window.writes++;if(window.failComments)return {ok:false,error:'comment storage failure'};window.durableComments=structuredClone(msg.operation.comments);}return {ok:true,comments:structuredClone(window.durableComments)};}return {ok:true};}};
    const area={async set(data){if(arguments.length!==1)throw Error('promise API received callback');window.writes++;await new Promise(r=>setTimeout(r,1));const hook=window.onSessionWrite;window.onSessionWrite=null;if(hook)hook();if(window.failSession)throw Error('session storage failure');window.durableSession=structuredClone(data);},async get(){if(window.failRead)throw Error('read failure');return window.durableSession||{};}};
    if ('${mode}' === 'native') window.browser={runtime,storage:{session:area,local:area}};
    else {
      const local={set(data,cb){area.set(data).then(()=>cb(),error=>{runtime.lastError={message:error.message};cb();runtime.lastError=null;});},get(key,cb){area.get(key).then(cb,error=>{runtime.lastError={message:error.message};cb();runtime.lastError=null;});}};
      const send = runtime.sendMessage; runtime.sendMessage = (msg,cb) => { send(msg).then(cb); };
      window.chrome={runtime,storage:{local,...('${mode}' === 'polyfill-session'?{session:area}:{})}};
    }
  </script>${mode === 'native' ? '' : '<script src="polyfill.js"></script>'}<script src="bundle.js"></script><script src="test.js"></script>`);
  const run = spawnSync(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless', '--disable-gpu', '--no-first-run', '--disable-background-networking',
    `--user-data-dir=${resolve(fixture, 'profile')}`, '--dump-dom', '--virtual-time-budget=2000',
    pathToFileURL(resolve(fixture, 'index.html')).href,
  ], { encoding: 'utf8', timeout: 30000, maxBuffer: 3 * 1024 * 1024 });
  assert.equal(run.status, 0, run.error?.message || run.stderr);
  assert.match(run.stdout, /id="result">PASS:/, run.stdout);
  console.log(mode + ': ' + run.stdout.match(/PASS: [^<]+/)[0] + ' (actual handler/polyfill; storage backend mocked, not installed-extension certification)');
  }
} finally { rmSync(fixture, { recursive: true, force: true }); }
