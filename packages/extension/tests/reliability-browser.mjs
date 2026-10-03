import { buildSync } from 'esbuild';
import ts from 'typescript';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = mkdtempSync(resolve(pkg, '.reliability-test-'));
const source = readFileSync(resolve(pkg,'src/content/index.ts'),'utf8');
const ast = ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
const functions = ['enable','disable','openConfiguredTransport'];
const lifecycle = ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&functions.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');
const bg = ts.createSourceFile('background.ts',readFileSync(resolve(pkg,'src/background/index.ts'),'utf8'),ts.ScriptTarget.Latest,true);
const updated = bg.statements.find(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(bg)==='browser.tabs.onUpdated.addListener').getText(bg);
const connect = bg.statements.find(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(bg)==='browser.runtime.onConnect.addListener').getText(bg);
try {
  buildSync({stdin:{resolveDir:pkg,loader:'ts',contents:`
    export * from './src/content/change-tracker';
    export { getOrAssignId } from './src/content/helpers';
    import { replaySession, getStyleChanges, getTextChanges, getDomChanges } from './src/content/change-tracker';
    import { restoreCommentPins, hideAllPins as hideCommentPins } from './src/content/comments';
    import { isAnalyticsSender } from './src/platform/analytics';
    export function contentLifecycle() {
      let on=false, activationGeneration=0, shortcutResolve;
      const calls={shortcuts:0,transport:0,notifications:0,notices:[]};
      const dmIsActiveInstance=()=>true;
      const onHistoryKeyDown=()=>{}, refreshSelfTabId=()=>{}, resetOverlayTeardown=()=>{}, resetMeasureTeardown=()=>{}, applyBaseCursor=()=>{}, startPanelHeartbeat=()=>{}, enableInspect=()=>{}, onElementSelected=()=>{}, registerAllShortcuts=()=>{}, getFullState=()=>({enabled:on}), stopPanelHeartbeat=()=>{}, disableInspect=()=>{}, disableMultiSelect=()=>{}, destroyOverlays=()=>{}, teardownMeasureGuides=()=>{}, clearPendingRegionBox=()=>{}, cancelRegionDraw=()=>{}, isFrozen=()=>false, unfreezeAnimations=()=>{}, disableShortcuts=()=>{}, setSelectedElementId=()=>{}, clearForceStateClasses=()=>{}, clearPageStateForceCss=()=>{}, clearComputedLayoutOverlay=()=>{}, clearBaseCursor=()=>{}, restoreOriginalPreview=()=>{};
      const notifyPanel=(type,state)=>{calls.notifications++;calls.notices.push({type,state})};
      const getChangesPayload=async()=>({});
      const connectToServer=()=>{calls.transport++}, disconnectFromServer=()=>{};
      const DEFAULT_WS_PORT=1234;
      const loadShortcuts=()=>new Promise(r=>{shortcutResolve=r});
      const enableShortcuts=()=>{calls.shortcuts++};
      ${lifecycle}
      return {enable,disable,calls,resolveShortcuts:()=>shortcutResolve(),takeShortcut:()=>shortcutResolve};
    }
    export function backgroundLifecycle() {
      let listener,updatedListener,lookupResolve,injectionResolve;
      const calls=[];
      const panelPorts=new Map(),panelSurfaces=new Map(),transitioningTabs=new Set();
      let pinnedTabId=null,pinnedTabUrl=null;
      const navigationGenerations=new Map();
      const panelsForTab=id=>Array.from(panelPorts.values()).filter(t=>t===id).length;
      const browser={runtime:{id:'fixture',getURL:path=>'chrome-extension://fixture/'+path,onConnect:{addListener:fn=>listener=fn}},tabs:{onUpdated:{addListener:fn=>updatedListener=fn},query:()=>new Promise(r=>lookupResolve=r),get:()=>new Promise(r=>lookupResolve=r),sendMessage:async(id,msg)=>{calls.push(msg.type);return {}}}};
      const isScriptableUrl=()=>true,isFileAccessBlocked=async()=>false;
      const injectContentScript=()=>new Promise(r=>injectionResolve=r);
      ${connect}
      ${updated}
      return {calls,panelPorts,navigate:()=>updatedListener(7,{status:'complete'},{url:'https://example.test/new'}),open:()=>{let disconnect;const port={name:'sidepanel',sender:{id:'fixture',url:'chrome-extension://fixture/sidepanel/index.html'},postMessage:()=>{},onDisconnect:{addListener:fn=>disconnect=fn}};listener(port);return ()=>disconnect()},lookup:()=>lookupResolve([{id:7,url:'https://example.test'}]),injected:()=>injectionResolve?.()};
    }
  `},bundle:true,format:'iife',globalName:'Probe',outfile:resolve(fixture,'bundle.js'),tsconfig:resolve(pkg,'tsconfig.json')});
  writeFileSync(resolve(fixture,'index.html'),`<!doctype html><style>:root{--fade:0.9}#a {opacity:var(--fade) !important}</style><div id="fixture"><button id="a">A</button></div><pre id="result">RUNNING</pre><script>
    window.pending=[];window.comments=[];
    const area={get:key=>window.deferStorage?new Promise(r=>pending.push(()=>r(typeof key==='string'?{[key]:window.saved}:{'dm-mcp-mode':'local'}))):Promise.resolve({}),set:async()=>{}};
    window.browser={runtime:{id:'fixture',sendMessage:async msg=>msg.type==='COMMENT_STORE'?(window.deferStorage?new Promise(r=>pending.push(()=>r({ok:true,comments:window.comments}))):{ok:true,comments:window.comments}):{ok:true}},storage:{session:area,local:area}};
  </script><script src="bundle.js"></script><script src="test.js"></script>`);
  writeFileSync(resolve(fixture,'test.js'),String.raw`
(async()=>{
 const results=[], check=(v,label)=>results.push({label,ok:!!v});
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const by=id=>document.getElementById(id);
 try {
  let a=by('a'),id=Probe.getOrAssignId(a);
  Probe.applyStyleChange(id,'opacity','0.5');
  check(Probe.getStyleChanges()[0].oldValue==='var(--fade)','authored token preserved');
  check(getComputedStyle(a).opacity==='0.9','negative control: author-only fixture cannot beat page important without the privileged bridge');
  a.outerHTML='<button id="a">replacement</button>';await wait(30);
  check(by('a').getAttribute('data-dm-id')===id,'SPA replacement automatically rebinds unique identity');
  Probe.clearAllChanges();
  by('fixture').innerHTML='<button class="ambiguous">one</button><button class="ambiguous">two</button>';
  a=by('fixture').firstChild;id=Probe.getOrAssignId(a);Probe.applyStyleChange(id,'opacity','0.3');
  by('fixture').innerHTML='<button class="ambiguous">one</button><button class="ambiguous">two</button>';
  Probe.scheduleRestamp();await wait(30);
  check(!document.querySelector('[data-dm-id="'+id+'"]'),'ambiguous remount stays unbound');
  Probe.clearAllChanges();by('fixture').innerHTML='<button id="a">A</button>';
  id=Probe.getOrAssignId(by('a'));Probe.applyStyleChange(id,'color','red',undefined,undefined,':hover');
  by('a').outerHTML='<button id="a">new</button>';await wait(30);by('a').classList.add('dm-force-hover');
  check(getComputedStyle(by('a')).color==='rgb(255, 0, 0)','variant survives remount');
  Probe.setOverridesEnabled(false);by('a').outerHTML='<button id="a" class="dm-force-hover">preview</button>';await wait(30);
  check(getComputedStyle(by('a')).color!=='rgb(255, 0, 0)','remount does not enable preview overrides');
  Probe.setOverridesEnabled(true);check(getComputedStyle(by('a')).color==='rgb(255, 0, 0)','restore variant after preview remount');
  document.querySelector('#dm-applied-styles').remove();await wait(30);
  check(getComputedStyle(by('a')).color==='rgb(255, 0, 0)','removed managed sheet is rebuilt without losing variants');
  by('a').outerHTML='<button id="a" data-dm-id="dm-777">claimed</button>';await wait(30);
  check(by('a').getAttribute('data-dm-id')==='dm-777','remount does not steal another tracked identity');
  by('fixture').innerHTML='<button id="a">one</button><button id="a">two</button>';await wait(30);
  check(!document.querySelector('[data-dm-id="'+id+'"]'),'newly ambiguous formerly unique selector stays unbound');
  Probe.clearAllChanges();by('fixture').innerHTML='<button id="a">A</button>';
  const bg=Probe.backgroundLifecycle();const close=bg.open();close();bg.lookup();await wait(10);bg.injected();await wait(350);
  check(bg.panelPorts.size===0&&!bg.calls.includes('ACTIVATE_DESIGN_MODE'),'disconnect before tab lookup cancels binding and activation');
  const bg2=Probe.backgroundLifecycle();const close2=bg2.open();bg2.lookup();await wait(10);close2();bg2.injected();await wait(350);
  check(!bg2.calls.includes('ACTIVATE_DESIGN_MODE'),'disconnect during injection cancels activation');
  const bg3=Probe.backgroundLifecycle();const close3=bg3.open();bg3.lookup();await wait(10);bg3.injected();await wait(10);close3();await wait(350);
  check(!bg3.calls.includes('ACTIVATE_DESIGN_MODE'),'disconnect during activation delay cancels timer');
  const bg4=Probe.backgroundLifecycle();const close4=bg4.open();bg4.lookup();await wait(10);bg4.injected();await wait(10);
  bg4.navigate();await wait(10);close4();bg4.injected();await wait(350);
  check(!bg4.calls.includes('ACTIVATE_DESIGN_MODE'),'navigation completion cannot reactivate final disconnected surface');
  window.saved={styleChanges:[{id:'saved',elementId:'dm-800',selector:'#a',property:'opacity',oldValue:'1',newValue:'0.2',timestamp:1}],textChanges:[],domChanges:[]};
  by('fixture').insertAdjacentHTML('beforeend','<button id="comment">comment</button>');
  window.comments=[{id:'note',elementId:'dm-999',selector:'#comment',pageUrl:location.href,text:'saved',timestamp:1}];
  window.deferStorage=true;
  const life=Probe.contentLifecycle();life.enable();life.disable();const disabledNotifications=life.calls.notifications;
  check(disabledNotifications===1&&life.calls.notices[0].type==='STATE_UPDATE'&&life.calls.notices[0].state.enabled===false,'disable publishes one synchronous state notification');
  life.resolveShortcuts();pending.splice(0).forEach(r=>r());await wait(30);
  check(!by('comment').hasAttribute('data-dm-id')&&!document.querySelector('.dm-comment-pin'),'disabled lifecycle cannot restore late pins or anchors');
  check(life.calls.shortcuts===0,'disabled lifecycle cannot enable late shortcuts');
  check(life.calls.transport===0,'disabled lifecycle cannot open late transport');
  check(Probe.getStyleChanges().length===0,'disabled lifecycle cannot replay late session');
  check(life.calls.notifications===disabledNotifications,'disabled lifecycle cannot publish stale notifications');
  const life2=Probe.contentLifecycle();life2.enable();const oldStorage=pending.splice(0),oldShortcut=life2.takeShortcut();life2.disable();
  life2.enable();pending.splice(0).forEach(r=>r());life2.resolveShortcuts();await wait(30);
  Probe.applyStyleChange('dm-800','opacity','0.35');const before=JSON.stringify(Probe.getStyleChanges());
  oldStorage.forEach(r=>r());oldShortcut();await wait(30);
  check(JSON.stringify(Probe.getStyleChanges())===before&&life2.calls.shortcuts===1,'reopen generation rejects older replay and shortcut completion');
  life2.disable();
 }catch(e){results.push({ok:false,label:e.stack})}
 document.querySelector('#result').textContent=JSON.stringify(results);
})();
`);
  const run=spawnSync(process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless','--disable-gpu','--no-first-run','--disable-background-networking',`--user-data-dir=${resolve(fixture,'profile')}`,'--dump-dom','--virtual-time-budget=4000',pathToFileURL(resolve(fixture,'index.html')).href],{encoding:'utf8',timeout:30000,maxBuffer:3*1024*1024});
  assert.equal(run.status,0,run.error?.message||run.stderr);
  const encoded=run.stdout.match(/id="result">([^<]+)/)?.[1];
  assert.ok(encoded&&encoded!=='RUNNING',run.stdout);
  const results=JSON.parse(encoded.replaceAll('&gt;','>').replaceAll('&lt;','<').replaceAll('&amp;','&'));
  console.log(JSON.stringify(results,null,2));
  const required=results;
  assert.equal(required.filter(r=>!r.ok).length,0,'reliability component regressions');
  console.log('PASS '+required.length+' real Chromium DOM/lifecycle checks (actual lifecycle source, mocked extension APIs; run acceptance-installed.cjs separately for installed coverage)');
} finally { rmSync(fixture,{recursive:true,force:true}); }
