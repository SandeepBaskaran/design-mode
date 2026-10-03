const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../certification/panel-actions.cjs');
module.exports = async h => {
  const page = h.page || (() => {
    const {By, Key} = require('selenium-webdriver');
    const input = async fn => { await h.content(() => true); await fn(h.driver.actions({async:true})).perform(); };
    const mouse = {
      move: (x,y) => input(a=>a.move({x,y,origin:'viewport'})),
      down: () => input(a=>a.press()), up: () => input(a=>a.release()),
      click: (x,y) => input(a=>a.move({x,y,origin:'viewport'}).click()),
    };
    return {mouse, keyboard:{press: key => input(a=>key==='Alt+c'?a.keyDown(Key.ALT).sendKeys('c').keyUp(Key.ALT):a.sendKeys(Key.ESCAPE))},
      locator: selector => ({hover:async()=>{await h.content(()=>true);const el=await h.driver.findElement(By.css(selector));await h.driver.actions({async:true}).move({origin:el}).perform();},click:async()=>{await h.content(()=>true);await h.driver.findElement(By.css(selector)).click();}}),
      reload:async()=>h.navigate(await h.content(()=>location.href)),
      screenshot:async({path:filename})=>{await h.content(()=>true);fs.writeFileSync(filename,await h.driver.takeScreenshot(),'base64');},
    };
  })();
  const results = [];
  const inspect = s => h.panel(A.inspectSelector, s);
  const composer = () => inspect('textarea[data-dm-comment-input]');
  const comments = async () => (await h.send('SP_GET_CHANGES')).comments;
  const type = value => h.panel(A.inputSelector, {selector:'textarea[data-dm-comment-input]',value});
  const regions = () => h.content(() => [...document.querySelectorAll('.dm-comment-region')].map(e => {const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x+scrollX,y:r.y+scrollY,w:r.width,h:r.height,top:r.top,position:s.position,border:s.borderStyle,color:s.borderColor};}));
  const pins = () => h.content(() => [...document.querySelectorAll('.dm-comment-pin')].map(e=>({text:e.textContent,title:e.title})));
  const state = async () => (await inspect('[data-dm-action="toggle-inspect"]'))[0];
  const ensureInspect = async on => {if(((await state()).attributes['aria-pressed']==='true') !== on) await h.action('toggle-inspect');};
  const clickDrop = async () => {await h.action('region-comment');await page.mouse.click(500,350);await h.wait(400);};
  const drag = async (x=500,y=350,toX=740,toY=490) => {await h.action('region-comment');await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(toX,toY,{steps:8});await page.mouse.up();await h.wait(400);};
  const geometry = (r,expected) => {for(const k of ['x','y','w','h']) assert.ok(Math.abs(r[k]-expected[k])<1, `${k}: ${r[k]} != ${expected[k]}`);};
  async function run(id,name,fn) {
    if(process.env.CERTIFICATION_IDS&&!process.env.CERTIFICATION_IDS.split(',').includes(id))return;
    const row={id,name};results.push(row);
    try {await h.navigate(h.base+'/region-'+results.length);await h.panel(A.showDesign);await h.wait(250);await ensureInspect(true);row.evidence=await fn();row.status='pass';}
    catch(e) {row.status='fail';row.error=e.stack;}
    await h.screenshot('case-'+results.length+'-panel');
    await page.screenshot({path:path.join(h.out,'case-'+results.length+'-page.png')});
    fs.writeFileSync(path.join(h.out,'rows.json'),JSON.stringify({browser:h.version,results},null,2));
    console.log(row.status.toUpperCase(),id,name,row.error || '');
    // Explicit UI cleanup: navigation alone does not promise composer reset.
    if((await composer()).length) await h.action('cancel-comment');
    await h.send('SP_CANCEL_REGION_COMMENT');
    await page.mouse.up();
  }
  await run('6.9','drag retains dashed yellow pending region while typing',async()=>{
    await drag();let r=await regions();assert.equal(r.length,1);geometry(r[0],{x:500,y:350,w:240,h:140});assert.equal(r[0].position,'absolute');assert.equal(r[0].border,'dashed');assert.equal(r[0].color,'rgb(251, 191, 36)');assert.equal((await composer()).length,1);assert.equal((await inspect('div:has(> textarea[data-dm-comment-input]) > div:first-child > span:last-child'))[0].text.trim(),'region');await type('Persistent typed region');assert.deepEqual(await regions(),r);assert.equal((await comments()).length,0);return r;
  });
  await run('6.9b','single click creates 180x110 without selecting DOM',async()=>{
    await clickDrop();const r=await regions();assert.equal(r.length,1);geometry(r[0],{x:500,y:350,w:180,h:110});assert.equal(r[0].color,'rgb(251, 191, 36)');assert.equal((await composer()).length,1);assert.equal((await comments()).length,0);return r;
  });
  await run('6.9b','click near viewport edge clamps default box',async()=>{
    const v=await h.content(()=>({w:innerWidth,h:innerHeight}));await h.action('region-comment');await page.mouse.click(v.w-25,v.h-25);await h.wait(400);const r=await regions();geometry(r[0],{x:v.w-184,y:v.h-114,w:180,h:110});return r;
  });
  await run('6.9c','Add replaces pending with committed region numbered pin and row badge',async()=>{
    await clickDrop();await type('Committed region');await h.action('submit-comment');const c=await comments(),r=await regions(),p=await pins();assert.equal(c.length,1);assert.equal(c[0].text,'Committed region');assert.equal(c[0].elementId,'');geometry(c[0].region,{x:500,y:350,w:180,h:110});assert.equal(r.length,1);assert.equal(r[0].position,'fixed');assert.equal(p.length,1);assert.equal(p[0].text,'1');assert.equal((await composer()).length,0);await h.panel(A.showChanges);await h.wait(200);const row=await inspect('[data-dm-comment-item]');assert.equal(row.length,1);assert.equal((await inspect('[data-dm-comment-item] [title="Region comment"]')).length,1);assert.match(row[0].text,/Committed region/);return {c,r,p,row};
  });
  await run('6.10','pending and committed scroll anchors plus reload persistence',async()=>{
    await clickDrop();await type('Scroll persist region');await h.content(()=>{scrollTo(0,150);});await h.wait(400);const pending=await regions();geometry(pending[0],{x:500,y:350,w:180,h:110});assert.equal(pending[0].top,200);await h.action('submit-comment');await h.content(()=>{scrollTo(0,250);});await h.wait(500);const committed=await regions();geometry(committed[0],{x:500,y:350,w:180,h:110});assert.equal(committed[0].top,100);const c=await comments();await page.reload();await h.wait(1800);const after=await comments(),r=await regions();assert.deepEqual(after,c);assert.equal(r.length,1);geometry(r[0],c[0].region);assert.equal((await pins()).length,1);return {pending,committed,afterReload:r,comments:after};
  });
  await run('6.11','Cancel removes pending box without creating comment',async()=>{
    await clickDrop();await type('Do not save');await h.action('cancel-comment');assert.equal((await regions()).length,0);assert.equal((await pins()).length,0);assert.equal((await composer()).length,0);assert.equal((await comments()).length,0);return {comments:0,regions:0};
  });
  await run('6.11','Escape during pointer-down drag removes drawing and restores interaction',async()=>{
    await h.action('region-comment');await page.mouse.move(500,350);await page.mouse.down();await page.mouse.move(740,490,{steps:5});await page.keyboard.press('Escape');await page.mouse.up();await h.wait(400);assert.equal((await regions()).length,0);assert.equal((await composer()).length,0);assert.equal((await comments()).length,0);await h.select('heading');assert.match(await h.panelText(),/Region heading/);return {comments:0,regions:0,selectionRecovered:true};
  });
  async function suspended(mode,finish) {
    await h.select('heading');
    if(mode==='region') await clickDrop();
    else if(mode==='edit') {await h.action('comment');await type('Original element comment');await h.action('submit-comment');await h.panel(A.showChanges);await h.wait(200);await h.panel(A.clickSelector,'[data-dm-edit-comment]');await h.wait(350);}
    else await h.action('comment');
    await h.panel(A.showDesign);await h.wait(200);assert.match(await h.panelText(),/h1#heading/);
    const before=await state();assert.equal(before.attributes['aria-pressed'],'false');assert.equal(before.disabled,true);
    const selected=await h.content(()=>document.querySelector('#dm-select')?.getBoundingClientRect().toJSON());
    await page.locator('#other').hover();await page.locator('#other').click();await h.wait(350);
    const hover=await h.content(()=>{const e=document.querySelector('#dm-hover');return e?{display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility,width:e.getBoundingClientRect().width}:null;});
    assert.ok(!hover || hover.display==='none' || hover.visibility==='hidden' || hover.width===0,JSON.stringify(hover));
    assert.match(await h.panelText(),/h1#heading/);
    assert.deepEqual(await h.content(()=>document.querySelector('#dm-select')?.getBoundingClientRect().toJSON()),selected);
    if(finish==='submit-comment') await type('Saved '+mode);
    await h.action(finish);const after=await state();assert.equal(after.attributes['aria-pressed'],'true');assert.equal(after.disabled,false);await h.select('other');await h.panel(A.showDesign);await h.wait(200);assert.match(await h.panelText(),/div#other/);return {mode,finish,before,after,hover};
  }
  for(const mode of ['add','edit','region']) for(const finish of ['cancel-comment','submit-comment']) await run('6.12',`inspect suspended for ${mode}, restored on ${finish}`,()=>suspended(mode,finish));
  await run('6.8','hover pin cannot inspect extension UI',async()=>{
    await h.select('heading');await h.action('comment');await type('Pin transparent to inspector');await h.action('submit-comment');await h.select('other');await page.locator('.dm-comment-pin').hover();await h.wait(300);const text=await h.panelText();assert.doesNotMatch(text,/div\.dm-comment-pin/);const hover=await h.content(()=>{const e=document.querySelector('#dm-hover');return e?{display:getComputedStyle(e).display,rect:e.getBoundingClientRect().toJSON()}:null;});assert.ok(!hover || hover.display==='none' || hover.rect.width>40,JSON.stringify(hover));await page.locator('.dm-comment-pin').click();await h.wait(300);assert.match(await h.panelText(),/Pin transparent to inspector/);return {hover,pins:await pins(),limitation:'Hover non-inspection asserted; pin click intentionally opens comment UI.'};
  });
  await run('6.2','real browser Alt+C opens focused composer',async()=>{
    await h.select('heading');await page.keyboard.press('Alt+c');await h.wait(500);assert.equal((await composer()).length,1);const focus=await h.panel(A.focusState);fs.writeFileSync(path.join(h.out,'focus-state.json'),JSON.stringify(focus,null,2));assert.match(focus.active,/data-dm-comment-input/);assert.equal(focus.hasFocus,true);return {focus,delivery:'Browser automation keyboard, not physical macOS keyboard'};
  });
  const summary={browser:h.version,total:results.length,passed:results.filter(r=>r.status==='pass').length,failed:results.filter(r=>r.status==='fail').length,results};
  fs.writeFileSync(path.join(h.out,'rows.json'),JSON.stringify(summary,null,2));
  console.log(JSON.stringify({total:summary.total,passed:summary.passed,failed:summary.failed}));
  assert.equal(summary.failed,0,'Region certification failures (see durable evidence)');
};
