const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const A = require('./certification/panel-actions.cjs');
module.exports = async h => {
  const rows = [];
  const save = () => fs.writeFileSync(path.join(h.out, 'rows.json'), JSON.stringify({version:h.version, rows}, null, 2));
  const snap = s => h.panel(A.inspectSelector, s);
  const click = async s => { await h.panel(A.clickSelector, s); await h.wait(500); };
  const edit = async (s, v) => { await h.panel(A.inputSelector, {selector:s,value:String(v)}); await h.wait(650); };
  const section = async name => { const s='[data-dm-toggle-section="dm-sec-'+name+'"]'; if ((await snap(s))[0].attributes['aria-expanded'] !== 'true') await click(s); };
  const props = ['borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius'];
  const radii = () => h.content(props => {const s=getComputedStyle(document.getElementById('radius'));return props.map(p=>s[p]);}, props);
  const test = async (id, fn) => {const row={id,status:'running',clauses:[],missing:[]};rows.push(row);save();try{await fn(row);row.status=row.missing.length?'partial':'pass';}catch(e){row.status='fail';row.error=String(e.stack);row.missing.push('Execution stopped at assertion; remaining clauses unverified');}save();console.log(id,row.status,row.error||'');};
  await test('3.6', async row => {
    await h.navigate(h.base+'/radius');await h.panel(A.showDesign);await h.select('radius');await section('appearance');
    await click('[data-dm-corner-expand]');
    const original=await radii();assert.deepEqual(original,['3px','7px','17px','11px']);
    row.clauses.push({clause:'Start with unequal corners',actual:original});
    assert.equal((await snap('[data-dm-corner-link]'))[0].attributes['aria-pressed'],'false');
    await click('[data-dm-corner-link]');assert.equal((await snap('[data-dm-corner-link]'))[0].attributes['aria-pressed'],'true');
    assert.deepEqual(await radii(),original);row.clauses.push({clause:'Explicit link toggles without mutating CSS',pass:true});
    for(let i=0;i<props.length;i++){
      const before=await radii(),value=20+i;
      await edit('.dm-corner-grid input[data-dm-prop="'+props[i]+'"]',value);
      const actual=await radii();assert.deepEqual(actual,Array(4).fill(value+'px'));
      const changes=await h.send('SP_GET_CHANGES');
      assert(props.every(p=>JSON.stringify(changes).includes(p)));assert(JSON.stringify(changes).includes(value+'px'));
      await h.action('undo');assert.deepEqual(await radii(),before);
      await h.action('redo');assert.deepEqual(await radii(),actual);
      row.clauses.push({clause:'Linked '+props[i]+' propagates four corners; Changes; atomic Undo/Redo',before,actual,changes});save();
    }
    await click('[data-dm-corner-link]');assert.equal((await snap('[data-dm-corner-link]'))[0].attributes['aria-pressed'],'false');
    for(let i=0;i<props.length;i++){
      const before=await radii(), expected=[...before];expected[i]=(30+i)+'px';
      await edit('.dm-corner-grid input[data-dm-prop="'+props[i]+'"]',30+i);assert.deepEqual(await radii(),expected);
      await h.action('undo');assert.deepEqual(await radii(),before);await h.action('redo');assert.deepEqual(await radii(),expected);
      row.clauses.push({clause:'Unlinked '+props[i]+' remains independent; Undo/Redo',actual:expected});save();
    }
    await h.screenshot('radius-linked-unlinked');
  });
  await test('3.22', async row => {
    await h.navigate(h.base+'/motion');await h.panel(A.showDesign);await h.select('motion');await section('motion');
    await click('[data-dm-advanced-toggle="motion"]');
    const scope='[data-dm-advanced-body="motion"]';
    for(const prop of ['transitionDuration','animationDuration','transform','offsetPath','viewTransitionName']){
      assert((await snap(scope+' [data-dm-prop="'+prop+'"]')).length,prop+' raw editor in Motion');row.clauses.push({clause:prop+' raw editor under Motion',pass:true});
    }
    const supported=await h.content(()=>CSS.supports('animation-timeline','scroll()'));
    if(supported){assert((await snap(scope+' [data-dm-prop="animationTimeline"]')).length);row.clauses.push({clause:'Scroll-driven raw editor',pass:true});}
    else {row.clauses.push({clause:'Scroll-driven raw editor',status:'not-applicable',supportsAnimationTimelineScroll:supported,authority:'closure-plan-195 firefox:3.22 not_applicable_clauses'});}
    await edit(scope+' input[data-dm-prop="transform"]','translateX(19px)');
    const actual=await h.content(()=>getComputedStyle(document.getElementById('motion')).transform);assert.equal(actual,'matrix(1, 0, 0, 1, 19, 0)');
    row.clauses.push({clause:'Motion raw Transform writes real CSS property',actual});
    const changes=await h.send('SP_GET_CHANGES');assert(JSON.stringify(changes).includes('translateX(19px)'));
    await h.action('undo');assert.equal(await h.content(()=>getComputedStyle(document.getElementById('motion')).transform),'matrix(1, 0, 0, 1, 3, 0)');
    await h.action('redo');assert.equal(await h.content(()=>getComputedStyle(document.getElementById('motion')).transform),actual);
    row.clauses.push({clause:'Transform Changes and Undo/Redo',changes});await h.screenshot('motion-raw');
  });
};
