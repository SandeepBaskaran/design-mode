const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const A = require('./panel-actions.cjs');
module.exports = async h => {
  const results = [];
  const click = async selector => { await h.panel(A.clickSelector, selector); await h.wait(250); };
  const css = () => h.content(() => Object.fromEntries(['move','reorder'].map(id => {const s=getComputedStyle(document.getElementById(id));return [id,{box:s.boxShadow,filter:s.filter}]})));
  const changes = async () => (await h.send('SP_GET_CHANGES')).styleChanges;
  const metadata = async () => (await changes()).filter(c=>c.property==='__effect_hidden').map(c=>({elementId:c.elementId,value:c.newValue})).sort((a,b)=>a.elementId.localeCompare(b.elementId));
  const select = async id => { await h.select(id); if (!(await h.panel(A.inspectEffectRows)).length) await click('[data-dm-toggle-section="dm-sec-effects"]'); };
  for (const scenario of ['empty-stash','different-stashes','other-target-hidden','filter-empty-stash']) {
    const r={scenario};results.push(r);
    try {
      await h.navigate(h.base+'/'+scenario);await select('move');
      if (scenario !== 'other-target-hidden') {
        await click('[data-dm-effect-toggle="2"]');
        if (scenario !== 'different-stashes') await click('[data-dm-effect-toggle="2"]');
      }
      if (scenario==='different-stashes'||scenario==='other-target-hidden') {
        await select('reorder');await click('[data-dm-effect-toggle="1"]');
      }

      await select('reorder');
      if (h.driver) {
        const {By,Key} = require('selenium-webdriver');
        await h.driver.setContext('content');
        await h.driver.actions().keyDown(Key.SHIFT).click(await h.driver.findElement(By.id('move'))).keyUp(Key.SHIFT).perform();
      } else await h.page.locator('#move').click({modifiers:['Shift']});
      await h.wait(300);
      // The last Shift-clicked element is focused; both remain selected.
      const before=await css(), stash=await metadata();
      assert.equal(stash.length,scenario==='different-stashes'?2:1,'setup persisted target histories');
      if(scenario.includes('empty-stash')) assert.equal(stash[0].value,'[]','setup restored hidden shadow');
      if (scenario==='filter-empty-stash') {
        if (!(await h.panel(A.inspectSelector,'[data-dm-prop="__effd_lblur_0_radius"]')).length) await click('[data-dm-effect-expand="3"]');
        await h.panel(A.editProperty,{prop:'__effd_lblur_0_radius',value:'9'});
      } else {
        if (!(await h.panel(A.inspectSelector,'[data-dm-prop="__effd_box_0_x"]')).length) await click('[data-dm-effect-expand="0"]');
        await h.panel(A.editProperty,{prop:'__effd_box_0_x',value:'77'});
      }
      await h.wait(500);
      const after=await css();r.before=before;r.after=after;r.stashBefore=stash;r.stashAfter=await metadata();
      const key=scenario==='filter-empty-stash'?'filter':'box';
      assert.match(after.move[key],scenario==='filter-empty-stash'?/9px/:/77px/,'focused element edited');
      assert.match(after.reorder[key],scenario==='filter-empty-stash'?/9px/:/77px/,'second selected element edited');
      const afterStash=await metadata();
      const owned = rows => rows.map(c=>({elementId:c.elementId,raw:JSON.parse(c.value).map(e=>e.raw).sort()}));
      assert.deepEqual(owned(afterStash),owned(stash),'per-target stash values remain owned by their original target');
      if(scenario==='other-target-hidden') assert.equal(JSON.parse(afterStash[0].value)[0].id,'box:2','other target rebases against its own prior visible chain');
      else assert.deepEqual(afterStash,stash);
      const grouped=(await changes()).filter(c=>c.property===(key==='box'?'boxShadow':'filter'));
      assert.equal(new Set(grouped.map(c=>c.groupId)).size,1,'one changes group');
      await h.action('undo');
      const undone=await css();
      if(key==='box') assert.deepEqual(undone,before,'one undo restores both targets');
      else {assert.equal(undone.move.filter,'blur(2px)');assert.equal(undone.reorder.filter,'blur(2px)');}
      assert.deepEqual(await metadata(),stash);
      await h.action('redo');assert.deepEqual(await css(),after,'one redo restores both targets');assert.deepEqual(await metadata(),afterStash);
      r.status='pass';
    } catch(e) {r.status='fail';r.error=e.stack;}
    await h.screenshot(scenario+'-panel');
    if (h.page) await h.page.screenshot({path:path.join(h.out,scenario+'-fixture.png'),fullPage:true});
    fs.writeFileSync(path.join(h.out,'multiselect-results.json'),JSON.stringify({version:h.version,results},null,2));
  }
  console.log(JSON.stringify(results,null,2));assert.ok(results.every(r=>r.status==='pass'),'hidden multi-select regressions');
};
