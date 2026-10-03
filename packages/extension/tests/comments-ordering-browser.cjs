// Real DOM ordering regression; comment transport is deliberately controlled, not installed coverage.
const {buildSync}=require('esbuild'),{chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const pkg=path.resolve(__dirname,'..');
 const code=buildSync({stdin:{contents:"export * from './src/content/comments'; export { getOrAssignId } from './src/content/helpers';",resolveDir:pkg,loader:'ts'},bundle:true,write:false,format:'iife',globalName:'Probe',tsconfig:path.join(pkg,'tsconfig.json')}).outputFiles[0].text;
 const browser=await chromium.launch({executablePath:process.env.CHROME_BINARY,headless:true});
 try{
 const page=await browser.newPage();await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><main></main>'}));await page.goto('http://localhost/ordering');
 await page.evaluate(()=>{window.stored=[];window.reads=0;window.browser={runtime:{sendMessage:()=>{window.reads++;return window.pending?new Promise(r=>window.release=r):Promise.resolve({ok:true,comments:window.stored})}}}});
 await page.addScriptTag({content:code});
 const result=await page.evaluate(async()=>{
  const assertions=[];const check=(label,ok)=>{assertions.push({label,ok:!!ok});if(!ok)throw Error(label)};const tick=()=>new Promise(r=>setTimeout(r,30));const pins=()=>[...document.querySelectorAll('.dm-comment-pin')];
  const c=(id='a')=>({id,elementId:'dm-80',selector:'#target',text:id,timestamp:1,updatedAt:1,pageUrl:location.href,resolved:true});
  const mount=()=>document.querySelector('main').innerHTML='<div id="target" style="position:absolute;top:100px;left:100px;width:120px;height:60px"></div>';
  window.stored=[c(),{...c('region'),elementId:'',region:{x:20,y:40,w:50,h:60}}];await Probe.restoreCommentPins();check('region survives absent element',pins().length===1);
  const reads=window.reads;mount();await tick();check('storage first / late DOM restores missing pin',pins().length===2);check('mutation reconciliation does not read storage',window.reads===reads);check('saved identity stamped',document.querySelector('#target').dataset.dmId==='dm-80');
  document.querySelector('#target').style.top='180px';await tick();check('replay style mutation repositions cached pin',pins().some(p=>p.style.top==='166px'));check('resolved state preserved',pins().every(p=>p.style.opacity==='0.6'));
  document.querySelector('#target').remove();await tick();check('removed anchor removes pin',pins().length===1);mount();await tick();check('replacement target rebinds',pins().length===2);
  Probe.hideAllPins();document.querySelector('main').innerHTML='';window.pending=true;const restore=Probe.restoreCommentPins();mount();window.release({ok:true,comments:window.stored});await restore;await tick();check('DOM first / controlled storage last restores both',pins().length===2);window.pending=false;
  Probe.hideAllPins();document.querySelector('main').innerHTML='';window.pending=true;const stale=Probe.restoreCommentPins();history.pushState({},'','/different');window.release({ok:true,comments:window.stored});await stale;mount();await tick();check('navigation cancels pending storage',pins().length===0);window.pending=false;
  history.pushState({},'','/ordering');let current=true;await Probe.restoreCommentPins(()=>current);check('reactivation restores snapshot',pins().length===2);current=false;mount();await tick();check('caller generation cancels mutation reconciliation',pins().length===0);
  await Probe.restoreCommentPins();Probe.hideAllPins();mount();await tick();check('disabled pins never resurrect',pins().length===0);
  document.querySelector('main').innerHTML='';window.stored=[c(),{...c('second'),elementId:'dm-81',selector:'#other'}];await Probe.restoreCommentPins();
  mount();const other=document.createElement('div');other.id='other';document.querySelector('main').append(other);const target=document.querySelector('#target'),measure=target.getBoundingClientRect.bind(target);target.getBoundingClientRect=()=>{Probe.getOrAssignId(other);return measure()};await tick();
  check('bind all saved anchors before layout can allocate incidental identities',other.dataset.dmId==='dm-81'&&pins().length===2);
  Probe.hideAllPins();
  return assertions;
 });assert.ok(result.every(x=>x.ok));console.log(JSON.stringify({transport:'mocked comment store / real Chromium DOM',assertions:result},null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
