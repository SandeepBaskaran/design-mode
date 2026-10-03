const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const A = require('./panel-actions.cjs');
module.exports = async h => {
  const {page, panelPage, content, select, action, send, wait} = h;
  const rows = [];
  const test = async (name, fn) => {
    try { rows.push({name, status:'pass', observed:await fn()}); }
    catch(e) { rows.push({name, status:'fail', error:String(e.stack)}); }
    fs.writeFileSync(path.join(h.out,'matching-results.json'),JSON.stringify(rows,null,2));
  };
  const fresh = async name => { await h.navigate(h.base+'/'+name); await h.panel(A.showDesign); await select('card1'); };
  const edit = async (prop,value) => { const i=panelPage.locator(`input[data-dm-prop="${prop}"]`); await i.fill(value); await i.press('Enter'); await wait(400); };
  const values = prop => content(prop => [...document.querySelectorAll('.card')].map(e=>getComputedStyle(e)[prop]),prop);
  for (const prop of ['padding','margin']) await test(prop+' fanout + grouped undo/redo',async()=>{
    await fresh(prop); await action('toggle-matching-layers');
    assert.match(await h.panelText(),/3 selected/);
    await edit(prop,'23');
    const actual=await values(prop); assert.deepEqual(actual,['23px','23px','23px']);
    const changes=(await send('SP_GET_CHANGES')).styleChanges.filter(c=>c.property.startsWith(prop));
    assert.equal(changes.length,12); assert.equal(new Set(changes.map(c=>c.elementId)).size,3);
    assert.equal(new Set(changes.map(c=>c.groupId)).size,1);
    await h.panel(A.showChanges); await wait(350); assert.match(await h.panelText(),/3 elements/);
    await h.screenshot(prop+'-group'); await h.panel(A.showDesign); await wait(350);
    await action('undo'); assert.deepEqual(await values(prop),['12px','12px','12px']);
    await action('redo'); assert.deepEqual(await values(prop),actual);
    await action('toggle-matching-layers'); await edit(prop,'31');
    assert.deepEqual(await values(prop),['31px','23px','23px']);
    return {actual,records:changes.length};
  });
  await test('single-property fanout and batch border companions',async()=>{
    await fresh('styles'); await action('toggle-matching-layers');
    const single=await send('SP_APPLY_STYLE',{property:'paddingLeft',value:'27px'});
    assert.equal(single.appliedTo,3); assert.deepEqual(await values('paddingLeft'),Array(3).fill('27px'));
    await send('SP_APPLY_STYLES',{changes:[{property:'borderTopWidth',value:'4px'},{property:'borderRightWidth',value:'4px'}],groupLabel:'Border widths'}); await wait(350);
    assert.deepEqual(await values('borderTopWidth'),Array(3).fill('4px'));
    assert.deepEqual(await values('borderTopStyle'),Array(3).fill('solid'));
    await action('undo');
    assert.deepEqual(await values('borderTopWidth'),Array(3).fill('0px'));
    assert.deepEqual(await values('borderTopStyle'),Array(3).fill('none'));
    const remainingBorders=(await send('SP_GET_CHANGES')).styleChanges.filter(c=>c.property.startsWith('border'));
    assert.equal(remainingBorders.length,0,JSON.stringify(remainingBorders));
    await action('redo'); assert.deepEqual(await values('borderTopWidth'),Array(3).fill('4px'));
    assert.deepEqual(await values('borderTopStyle'),Array(3).fill('solid'));
    await send('SP_APPLY_STYLES',{changes:[null,{property:'paddingTop'},{property:'paddingLeft',value:'28px'}]});
    assert.deepEqual(await values('paddingLeft'),Array(3).fill('28px'));
    return {paddingLeft:await values('paddingLeft'),border:await values('borderTopWidth')};
  });
  await test('0.10.18 supported length and unitless steps',async()=>{
    await fresh('numeric'); await select('heading');
    const i=panelPage.locator('input[data-dm-prop="lineHeight"]');
    await edit('lineHeight','1.5'); await i.press('ArrowUp'); await wait(350);
    assert.equal(await i.inputValue(),'1.6'); assert.equal(await content(()=>getComputedStyle(document.querySelector('#heading')).lineHeight),'51.2px');
    await i.press('Shift+ArrowUp'); await wait(350); assert.equal(await i.inputValue(),'2.6');
    await edit('lineHeight','24px'); await i.press('ArrowUp'); await wait(350); assert.equal(await i.inputValue(),'25px');
    await i.press('Shift+ArrowUp'); await wait(350); assert.equal(await i.inputValue(),'35px');
    await panelPage.locator('[data-dm-action="undo"]').click(); await wait(350); assert.equal(await i.inputValue(),'25px');
    await panelPage.locator('[data-dm-action="redo"]').click(); await wait(350); assert.equal(await i.inputValue(),'35px');
    await edit('lineHeight','1.5em'); assert.equal(await i.inputValue(),'1.5em');
    assert.equal(await content(()=>getComputedStyle(document.querySelector('#heading')).lineHeight),'48px');
    await edit('lineHeight','150%'); assert.equal(await i.inputValue(),'150%');
    assert.equal(await content(()=>getComputedStyle(document.querySelector('#heading')).lineHeight),'48px');
    for (const [value,stepped] of [['18pt','19pt'],['1lh','2lh'],['24PX','25PX']]) {
      await edit('lineHeight',value); await i.press('ArrowUp'); await wait(350); assert.equal(await i.inputValue(),stepped);
    }
    await edit('lineHeight','normal'); assert.equal(await i.inputValue(),'');
    assert.equal(await content(()=>getComputedStyle(document.querySelector('#heading')).lineHeight),'normal');
    await edit('lineHeight','-2'); assert.equal(await content(()=>getComputedStyle(document.querySelector('#heading')).lineHeight),'normal');
    await edit('lineHeight','garbage'); assert.equal(await content(()=>getComputedStyle(document.querySelector('#heading')).lineHeight),'normal');
    assert((await send('SP_GET_CHANGES')).styleChanges.filter(c=>c.property==='lineHeight').every(c=>!['-2','garbage'].includes(c.newValue)));
    // Keep the existing flex-grow fractional stepping contract covered too.
    await select('card1');
    await panelPage.locator('[data-dm-advanced-toggle="layout"]').click();
    const scale=panelPage.locator('input[data-dm-prop="flexGrow"]');
    await scale.fill('1.5'); await scale.press('Enter'); await scale.press('ArrowUp'); await wait(350); assert.equal(await scale.inputValue(),'1.6');
    await scale.press('Shift+ArrowUp'); await wait(350); assert.equal(await scale.inputValue(),'2.6');
    assert.equal(await content(()=>getComputedStyle(document.querySelector('#card1')).flexGrow),'2.6');
    return {lineHeight:'unitless, px, em, %, normal; undo/redo; invalid rejected',flexGrow:'2.6'};
  });
  await test('0.10.0 Help shortcuts and all dismissal paths',async()=>{
    await action('help'); await action('show-shortcuts');
    const card=panelPage.locator('[data-dm-shortcuts-card]'); assert.equal(await card.count(),1);
    const text=await card.textContent(); for(const category of ['General','Annotations','Animation','Export','Navigation','Fixed']) assert(text.includes(category),category);
    for (const label of ['Delete Element','Undo','Redo','Deselect']) assert(text.includes(label),label);
    assert(await card.locator('kbd').count()>5); await card.click({position:{x:15,y:15}}); assert.equal(await card.count(),1);
    await panelPage.keyboard.press('Escape'); assert.equal(await card.count(),0);
    await action('show-shortcuts'); await panelPage.locator('button[data-dm-action="close-shortcuts"]').click(); assert.equal(await card.count(),0);
    await action('show-shortcuts'); await panelPage.locator('div[data-dm-action="close-shortcuts"]').click({position:{x:2,y:2}}); assert.equal(await card.count(),0);
    return {categories:true,insideClick:true,escape:true,close:true,backdrop:true};
  });
  console.log(JSON.stringify({version:h.version,rows},null,2));
  assert(rows.every(r=>r.status==='pass'),'matching/UI regression failures');
};
