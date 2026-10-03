const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {By, Key} = require('selenium-webdriver');
const actions = require('./panel-actions.cjs');

module.exports = async h => {
  const {driver, panel, content, navigate, select, action, send, base, out, version, wait, screenshot, panelText} = h;
  const rows = [];
  const controls = selector => panel(actions.inspectControls, selector);
  const click = async selector => { await panel(actions.clickSelector, selector); await wait(350); };
  const input = async (selector, value) => { await panel(actions.inputSelector, {selector,value}); await wait(350); };
  const edit = (prop, value) => input(`[data-dm-prop="${prop}"]`, value);
  const tab = name => click(`[data-dm-tab="${name}"]`);
  const fresh = async (name, id='box') => {
    await navigate(base+'/'+name); await tab('design'); await select(id);
    // A delayed empty-panel query must not replace the user's page selection.
    const context = await send('SP_INSPECT_PAGE');
    rows.at(-1).pageContextAfterSelection = context;
    assert.equal(context.payload.elementId, id);
    await content(() => {
      window.__dmCertificationEvents=[];
      for(const type of ['keydown','keyup','mousedown','mousemove','mouseup','click'])window.addEventListener(type,e=>window.__dmCertificationEvents.push({type,key:e.key,x:e.clientX,y:e.clientY,shift:e.shiftKey,alt:e.altKey,target:e.target.id,tag:e.target.tagName,trusted:e.isTrusted}),true);
    });
  };
  const rect = selector => content(selector => document.querySelector(selector).getBoundingClientRect().toJSON(), selector);
  const css = (id, prop) => content(({id,prop}) => getComputedStyle(document.getElementById(id))[prop], {id,prop});
  const near = (a,b,label) => assert.ok(Math.abs(a-b)<2, `${label}: ${a} != ${b}`);
  const changes = () => send('SP_GET_CHANGES');
  const fields = async () => Object.fromEntries((await controls('[data-dm-prop]')).map(e=>[e.prop,e.value]));
  const save = () => fs.writeFileSync(path.join(out,'rows.json'), JSON.stringify({version,surface:'Native Firefox temporary installed extension and real sidebar; WebDriver page pointer/key actions; fixed dispatcher DOM actions in sidebar; disposable profile; localhost only',rows},null,2));
  const test = async (id, fn, limitation=null) => {
    if (process.env.DM_CERTIFICATION_IDS && !process.env.DM_CERTIFICATION_IDS.split(',').includes(id)) return;
    const r={id,status:'running',limitation}; rows.push(r); save();
    try { r.observed=await fn(); r.status=limitation?'partial':'pass'; }
    catch(e) { r.status='fail'; r.error=String(e.stack); }
    finally {
      await content(()=>true); await driver.actions().clear();
      r.events=await content(()=>window.__dmCertificationEvents);
      r.page=await content(()=>({box:document.querySelector('#box')?.getBoundingClientRect().toJSON(),copy:document.querySelector('#copy')?.getBoundingClientRect().toJSON(),selection:document.querySelector('#dm-select')?.outerHTML}));
      try { r.panelText=await panelText(); await screenshot(id); r.screenshot=id+'.png'; } catch(e) { r.evidenceError=String(e); }
      save(); console.log(id,r.status,r.error?.split('\n')[0]||'');
    }
  };
  const pointer = async (selector, dx, dy, modifiers=[], release=true) => {
    await content(()=>true); const b=await rect(selector);
    const before=await content(selector=>({selector,rect:document.querySelector(selector).getBoundingClientRect().toJSON(),id:document.querySelector(selector).getAttribute('data-dm-id'),selection:document.querySelector('#dm-select')?.outerHTML,multi:document.querySelectorAll('.dm-multi-overlay').length}),selector);
    (rows.at(-1).pointers ||= []).push({before,dx,dy,modifiers});
    const x=Math.round(b.x+b.width/2),y=Math.round(b.y+b.height/2);
    let a=driver.actions().move({x,y,origin:'viewport'});
    for(const key of modifiers)a.keyDown(key);
    a.press();
    for(let step=1;step<=8;step++)a.move({x:x+Math.round(dx*step/8),y:y+Math.round(dy*step/8),origin:'viewport',duration:35});
    if(release) { a.release(); for(const key of modifiers)a.keyUp(key); }
    await a.perform(); await wait(350); return b;
  };
  const resize = (dir,dx,dy,release=true) => pointer(`#dm-resize-dots > div:nth-child(${dir+1})`,dx,dy,[],release);
  const anchor = async () => {
    const b=await rect('#box');
    const o=await content(()=>{const e=document.querySelector('#dm-select');return {rect:e.getBoundingClientRect().toJSON(),width:parseFloat(e.style.width),height:parseFloat(e.style.height),transition:getComputedStyle(e).transitionDuration}});
    for(const k of ['x','y'])near(o.rect[k],b[k],k); for(const k of ['width','height'])near(o[k],b[k],k);
    const dots=await content(()=>[...document.querySelectorAll('#dm-resize-dots > div')].map(e=>{const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}}));
    assert.equal(dots.length,8);const pts=[[0,0],[.5,0],[1,0],[1,.5],[1,1],[.5,1],[0,1],[0,.5]];
    dots.forEach((d,i)=>{near(d.x,b.x+pts[i][0]*b.width,'handle x');near(d.y,b.y+pts[i][1]*b.height,'handle y')});return {box:b,overlay:o,dots};
  };
  await test('1.5',async()=>{await fresh('breadcrumb','button1');const text=await panelText();assert.match(text,/body.*main.*(section|pair).*(article|card).*button/s);return text});
  await test('1.14',async()=>{
    await fresh('resize-live');await resize(4,40,30,false);const a=await anchor(),f=await fields();near(a.box.width,140,'width');near(a.box.height,110,'height');assert.equal(parseFloat(f.width),140);assert.equal(parseFloat(f.height),110);assert.equal(a.overlay.transition,'0s');
    const guides=await content(()=>({label:document.querySelector('#dm-dim-label').innerText,styles:[...document.querySelectorAll('#dm-axis-guides > *')].map(e=>e.style.cssText)}));assert.equal(guides.label,'140 × 110');assert.equal(guides.styles.length,4);assert.ok(guides.styles.every(s=>s.includes('255, 107, 53')));await screenshot('1.14-live');await content(()=>true);await driver.actions().release().perform();return {a,f,guides};
  });
  await test('1.15',async()=>{
    await fresh('resize-export');await resize(4,40,30);await tab('changes');const c=await changes(),exported=await send('SP_EXPORT',{format:'css'});assert.match(await panelText(),/Resize/);assert.match(JSON.stringify(exported),/width[^\n]*140/);assert.match(JSON.stringify(exported),/height[^\n]*110/);await action('undo');near((await rect('#box')).width,100,'undo width');near((await rect('#box')).height,80,'undo height');await action('redo');near((await rect('#box')).width,140,'redo width');near((await rect('#box')).height,110,'redo height');await action('undo');await tab('design');await select('box');await resize(3,25,0);const edge=await changes();assert.equal(edge.styleChanges.length,1);assert.match(JSON.stringify(edge.styleChanges),/width/);assert.doesNotMatch(JSON.stringify(edge.styleChanges),/"property":"height"/);await action('undo');near((await rect('#box')).width,100,'edge undo');await action('redo');near((await rect('#box')).width,125,'edge redo');return {c,exported,edge};
  },'Export response checked, not clipboard/native export control. Undo/redo uses sidebar DOM controls, not physical keys.');
  await test('1.21',async()=>{
    await fresh('move-export');const before=await pointer('#box',40,25,[Key.ALT]);await tab('changes');const c=await changes(),exported=await send('SP_EXPORT',{format:'css'});assert.match(await panelText(),/Move/);assert.equal(c.styleChanges.length,2);assert.equal(new Set(c.styleChanges.map(x=>x.groupId)).size,1);assert.match(JSON.stringify(exported),/left[^\n]*40/);assert.match(JSON.stringify(exported),/top[^\n]*25/);await action('undo');const after=await rect('#box');near(after.x,before.x,'undo x');near(after.y,before.y,'undo y');await action('redo');near((await rect('#box')).x,before.x+40,'redo x');near((await rect('#box')).y,before.y+25,'redo y');return {c,exported,before,after};
  },'Export response checked, not clipboard/native export control.');
  await test('1.23',async()=>{await fresh('axis');const before=await pointer('#box',60,15,[Key.SHIFT]),after=await rect('#box');near(after.y,before.y,'horizontal lock');assert.ok(after.x>before.x);await action('undo');const beforeV=await pointer('#box',12,60,[Key.SHIFT]),afterV=await rect('#box');near(afterV.x,beforeV.x,'vertical lock');assert.ok(afterV.y>beforeV.y);return {before,after,beforeV,afterV}});
  await test('1.24',async()=>{await fresh('static','copy');const before=await pointer('#copy',35,25,[Key.ALT]);const f=await fields(),c=await changes();assert.equal(await css('copy','position'),'relative');assert.equal(f.position,'relative');assert.equal(parseFloat(f.left),35);assert.equal(parseFloat(f.top),25);assert.equal(c.styleChanges.length,3);await tab('changes');assert.match(await panelText(),/Move/);await action('undo');assert.equal(await css('copy','position'),'static');const after=await rect('#copy');near(after.x,before.x,'undo x');near(after.y,before.y,'undo y');assert.equal((await changes()).styleChanges.length,0);await action('redo');assert.equal(await css('copy','position'),'relative');near((await rect('#copy')).x,before.x+35,'redo x');return {before,after,f,c}});
  await test('1.25',async()=>{await fresh('multi');await content(()=>true);const copy=await driver.findElement(By.id('copy'));await driver.actions().keyDown(Key.SHIFT).click(copy).keyUp(Key.SHIFT).perform();await wait(350);const b=await rect('#box'),c=await rect('#copy');await pointer('#box',43,27,[Key.ALT]);const ba=await rect('#box'),ca=await rect('#copy');near(ba.x-b.x,ca.x-c.x,'same dx');near(ba.y-b.y,ca.y-c.y,'same dy');assert.ok(ba.x>b.x);await action('undo');for(const [id,r] of [['box',b],['copy',c]]){const u=await rect('#'+id);near(u.x,r.x,'undo x');near(u.y,r.y,'undo y')}assert.equal(await content(()=>document.querySelectorAll('.dm-multi-overlay').length),2);await action('redo');near((await rect('#box')).x,ba.x,'redo x');near((await rect('#copy')).y,ca.y,'redo y');return {b,c,ba,ca}});
  await test('0.10.14b',async()=>{
    await fresh('delete');await tab('layers');const order=()=>content(()=>[...document.querySelectorAll('#main > *')].map(e=>e.id));const before=await order();
    for(const [id,shiftKey] of [['heading',false],['copy',true]]){const dmId=await content(id=>document.getElementById(id).getAttribute('data-dm-id'),id);await panel(actions.modifiedClick,{selector:`[data-dm-layer="${dmId}"]`,shiftKey});await wait(250)}
    assert.match(await panelText(),/2 selected/);await action('delete');assert.equal(await content(()=>document.querySelectorAll('#heading,#copy').length),0);const c=await changes();assert.deepEqual(c.domChanges.filter(c=>c.action==='delete').map(c=>c.selector).sort(),['#copy','#heading']);assert.doesNotMatch(await panelText(),/2 selected/);await tab('changes');assert.match(await panelText(),/Delete/i);await action('undo');assert.deepEqual(await order(),before);assert.equal((await changes()).domChanges.length,0);await action('redo');assert.equal(await content(()=>document.querySelectorAll('#heading,#copy').length),0);await action('undo');assert.deepEqual(await order(),before);return {before,c,restored:await order()};
  });
  for(const id of ['1.29','1.31'])rows.push({id,status:'not-run',limitation:'Chrome CDP device emulation has no native Firefox counterpart in this harness. Firefox responsive-design toolbar and hover capability transitions not exercised.'});save();
  await test('0.5.3',async()=>{await fresh('formats','heading');const obs=[];for(const [fmt,re]of [['hex',/^#/],['rgba',/^rgba?\(/],['hsl',/^hsla?\(/]]){await action('settings');await click(`[data-dm-color-format="${fmt}"]`);await action('back-from-settings');for(const id of ['heading','card1','box']){await select(id);const values=(await controls('input[data-dm-tokens-trigger]')).map(e=>e.value);assert.ok(values.length);values.forEach(value=>assert.match(value,re));obs.push({fmt,id,values})}}assert.equal((await changes()).styleChanges.length,0);return obs});
  await test('2.13',async()=>{await fresh('toggles','copy');const obs=[];for(let repeat=0;repeat<10;repeat++)for(const [toggle,prop,on,off]of [['bold','fontWeight','700','400'],['italic','fontStyle','italic','normal'],['underline','textDecorationLine','underline','none'],['strikethrough','textDecorationLine','line-through','none']]){await click(`[data-dm-text-toggle="${toggle}"]`);assert.equal(await css('copy',prop),on);await click(`[data-dm-text-toggle="${toggle}"]`);assert.equal(await css('copy',prop),off);obs.push({repeat,toggle,on,off})}return obs});
  await test('2.17',async()=>{await fresh('search','copy');await click('[data-dm-color-trigger="color"]');await panel(actions.searchColor,'primary');await wait(350);const tokens=(await controls('[data-dm-pick-color]')).map(e=>e.token);assert.ok(tokens.length>0);assert.ok(tokens.every(t=>t.includes('primary')));return tokens});
  const widths=()=>content(()=>['Top','Right','Bottom','Left'].map(s=>getComputedStyle(document.querySelector('#card1'))['border'+s+'Width']));
  for(const id of ['3.3','3.4','3.5'])await test(id,async()=>{
    await fresh('border-'+id,'card1');if((await controls('[data-dm-advanced-toggle="stroke"]')).length)await click('[data-dm-advanced-toggle="stroke"]');const link='[data-dm-border-link="width"]';assert.equal((await controls(link)).length,1);if((await controls(link))[0].title.startsWith('Linked'))await click(link);
    for(const [side,v]of [['Top','2'],['Right','3'],['Bottom','4'],['Left','5']])await edit('border'+side+'Width',v);assert.deepEqual(await widths(),['2px','3px','4px','5px']);
    if(id!=='3.3'){await click(link);assert.match((await controls(link))[0].title,/^Linked/);await edit('borderTopWidth','7');assert.deepEqual(await widths(),['7px','7px','7px','7px']);await action('undo');assert.deepEqual(await widths(),['2px','3px','4px','5px']);await action('redo');assert.deepEqual(await widths(),['7px','7px','7px','7px']);if(id==='3.5'){await click(link);assert.match((await controls(link))[0].title,/^Unlinked/);await edit('borderRightWidth','9');assert.deepEqual(await widths(),['7px','9px','7px','7px'])}}
    return {widths:await widths(),changes:await changes()};
  });
  await test('3.9b',async()=>{await fresh('gap','card1');await click('[data-dm-layout-mode="hstack"]');await click('[data-dm-children-align="right-bottom"]');await input('[data-dm-gap-mode="col"]','auto');assert.equal(await css('card1','justifyContent'),'space-between');assert.equal((await controls('[data-dm-children-align][data-active="true"]')).length,0);await input('[data-dm-gap-mode="col"]','fixed');assert.equal(await css('card1','justifyContent'),'flex-end');assert.equal((await controls('[data-dm-children-align="right-bottom"]'))[0].active,'true');return {autoActive:0,fixed:await css('card1','justifyContent')}});
  await test('3.11',async()=>{await fresh('z','card1');await edit('position','relative');await edit('zIndex','12');assert.equal(await css('card1','zIndex'),'12');return {committed:await css('card1','zIndex')}} ,'Integer commit only; dispatcher value assignment does not exercise physical decimal typing or letter rejection.');
  assert.equal(rows.filter(r=>r.status==='fail').length,0,'Native Firefox selection/panel failures; see rows.json');
};
