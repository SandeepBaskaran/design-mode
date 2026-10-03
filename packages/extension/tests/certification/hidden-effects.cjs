const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const A = require('./panel-actions.cjs');
module.exports = async h => {
  const results = [];
  const click = async selector => { await h.panel(A.clickSelector, selector); await h.wait(350); };
  const rows = () => h.panel(A.inspectEffectRows);
  const css = id => h.content(id => {const s=getComputedStyle(document.getElementById(id));return {box:s.boxShadow,filter:s.filter}},id);
  const hideC = async id => { await h.select(id); if (!(await rows()).length) await click('[data-dm-toggle-section="dm-sec-effects"]'); await click('[data-dm-effect-toggle="2"]'); assert.equal((await rows()).length,3); assert.ok(!(await css(id)).box.includes('33px')); };
  const hiddenC = async () => {const r=await rows();assert.equal(r.length,3);const c=r.find(x=>x.text.includes('33 2 3'));assert.ok(c,'C remains a row');assert.match(c.toggle,/show/i,'C remains hidden');return r};
  const moveA = async () => {if (!(await h.panel(A.inspectSelector,'[data-dm-prop="__effd_box_0_show_behind"]')).length) await click('[data-dm-effect-expand="0"]');await click('[data-dm-prop="__effd_box_0_show_behind"]')};
  const run = async (id,fn) => {const r={id};results.push(r);try{r.observed=await fn();r.status='pass'}catch(e){r.status='fail';r.error=e.stack}fs.writeFileSync(path.join(h.out,'hidden-results.json'),JSON.stringify({version:h.version,results},null,2))};
  await run('cross-chain-hidden-neighbor',async()=>{await hideC('move');await moveA();const r=await hiddenC();assert.ok((await css('move')).filter.includes('11px'));await click(`[data-dm-effect-toggle="${r.findIndex(x=>x.text.includes('33 2 3'))}"]`);const s=await css('move');assert.ok(s.box.includes('22px')&&s.box.includes('33px'));assert.ok(!s.box.includes('11px'));return {rows:r,css:s}});
  await run('hidden-reorder',async()=>{await hideC('reorder');await h.panel(A.dragEffectRow,{from:2,to:0});await h.wait(350);const r=await hiddenC();assert.ok(r[0].text.includes('33 2 3'),'hidden C moved to start');const s=await css('reorder');assert.ok(s.box.includes('11px')&&s.box.includes('22px')&&!s.box.includes('33px'),'drag hidden row never moves/deletes visible neighbor');await click('[data-dm-effect-toggle="0"]');assert.match((await css('reorder')).box,/^rgb\(0, 0, 255\)/);return {rows:r,css:s}});
  await run('stroke-mutation-hidden-neighbor',async()=>{await hideC('stroke');await click('[data-dm-stroke-pos="outside"]');await click('[data-dm-stroke-add]');const r=await hiddenC();assert.ok(r[0].text.includes('11 2 3')&&r[1].text.includes('22 2 3')&&r[2].text.includes('33 2 3'),'stroke insertion preserves logical effect order');await click(`[data-dm-effect-toggle="${r.findIndex(x=>x.text.includes('33 2 3'))}"]`);const s=await css('stroke');assert.ok(s.box.includes('11px')&&s.box.includes('22px')&&s.box.includes('33px'));return {rows:r,css:s}});
  await run('undo-redo-while-hidden',async()=>{await hideC('undo');await moveA();await h.action('undo');let r=await hiddenC();let s=await css('undo');assert.ok(s.box.includes('11px')&&s.box.includes('22px')&&!s.box.includes('33px'));assert.equal(s.filter,'none');await h.action('redo');r=await hiddenC();await h.action('undo');await h.action('undo');r=await rows();assert.equal(r.length,3);assert.ok(r.every(x=>/hide/i.test(x.toggle)),'undo hide restores three visible rows without duplicate stash');await h.action('redo');await hiddenC();return {rows:r,css:s}});
  await run('multiple-hidden-remove-restore',async()=>{
    await hideC('multiple'); await click('[data-dm-effect-toggle="1"]');
    await click('[data-dm-effect-remove="0"]');
    let r=await rows(); assert.equal(r.length,2); assert.ok(r.every(x=>/show/i.test(x.toggle)));
    assert.equal((await css('multiple')).box,'none');
    await click('[data-dm-effect-remove="0"]'); r=await rows();assert.equal(r.length,1);assert.ok(r[0].text.includes('33 2 3'));
    await h.action('undo'); r=await rows();assert.equal(r.length,2);assert.ok(r.every(x=>/show/i.test(x.toggle)));
    await click('[data-dm-effect-toggle="1"]');await click('[data-dm-effect-toggle="0"]');
    const s=await css('multiple'); assert.ok(s.box.indexOf('22px') < s.box.indexOf('33px')); assert.ok(!s.box.includes('11px'));return {rows:await rows(),css:s};
  });
  await run('visible-reorder-around-hidden',async()=>{
    await hideC('visible-reorder');
    await h.panel(A.dragEffectRow,{from:0,to:2});await h.wait(350);
    let r=await hiddenC();assert.ok(r[0].text.includes('22 2 3')&&r[1].text.includes('33 2 3')&&r[2].text.includes('11 2 3'));
    await h.action('undo');r=await hiddenC();assert.ok(r[0].text.includes('11 2 3')&&r[2].text.includes('33 2 3'));return r;
  });
  await run('filter-to-box-hidden-neighbor',async()=>{
    await h.select('filter');await click('[data-dm-effect-toggle="2"]');
    if (!(await h.panel(A.inspectSelector,'[data-dm-prop="__effd_fx_0_show_behind"]')).length) await click('[data-dm-effect-expand="0"]');
    await click('[data-dm-prop="__effd_fx_0_show_behind"]');const r=await hiddenC();
    assert.ok((await css('filter')).box.includes('11px'));
    await click(`[data-dm-effect-toggle="${r.findIndex(x=>x.text.includes('33 2 3'))}"]`);
    const s=await css('filter');assert.ok(s.filter.includes('22px')&&s.filter.includes('33px')&&!s.filter.includes('11px'));return {rows:r,css:s};
  });
  await run('box-to-text-hidden-neighbor',async()=>{
    await hideC('text');await moveA();const r=await hiddenC();
    assert.ok(await h.content(()=>getComputedStyle(document.querySelector('#text')).textShadow.includes('11px')));
    await h.action('undo');await hiddenC();return r;
  });
  await run('duplicate-visible-identities',async()=>{
    await h.select('duplicates');await click('[data-dm-effect-toggle="1"]');await moveA();
    let r=await rows();assert.equal(r.length,3);assert.ok(r[0].text.includes('22 2 3'));assert.match(r[0].toggle,/show/i);
    await h.action('undo');r=await rows();assert.ok(r[1].text.includes('22 2 3'));assert.match(r[1].toggle,/show/i);
    await h.action('redo');r=await rows();assert.ok(r[0].text.includes('22 2 3'));await click('[data-dm-effect-toggle="0"]');
    const s=await css('duplicates');assert.ok(s.box.indexOf('22px') < s.box.indexOf('11px'));return {rows:r,css:s};
  });
  console.log(JSON.stringify(results,null,2));assert.ok(results.every(x=>x.status==='pass'),'hidden effect regressions');
};
