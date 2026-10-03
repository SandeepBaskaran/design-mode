const fs=require('node:fs'),assert=require('node:assert/strict');
const A=require('./certification/panel-actions.cjs');
module.exports=async h=>{
 const assertions=[];let error;const check=(label,ok,evidence)=>{assertions.push({label,ok:!!ok,evidence});assert.ok(ok,label)};
 const snap=()=>h.content(()=>({timeOrigin:performance.timeOrigin,url:location.href,targets:[...document.querySelectorAll('#heading,#other')].map(e=>({id:e.id,dm:e.dataset.dmId,rect:e.getBoundingClientRect().toJSON()})),pins:[...document.querySelectorAll('.dm-comment-pin')].map(e=>({title:e.title,top:e.style.top,left:e.style.left,opacity:e.style.opacity}))}));
 try{
  await h.navigate(h.base+'/ordering');await h.panel(A.showDesign);
  for(const id of ['heading','other']){await h.select(id);if(id==='heading'){await h.panel(A.editProperty,{prop:'fontSize',value:'44'});await h.wait(250)}await h.action('comment');await h.panel(A.inputSelector,{selector:'[data-dm-comment-input]',value:'ordering '+id});await h.action('submit-comment')}
  await h.panel(A.showChanges);await h.wait(400);await h.panel(A.clickSelector,'[data-dm-toggle-resolved]');await h.wait(300);
  const initial=await snap();check('two saved element pins before reload',initial.pins.length===2,initial);
  await h.content(()=>sessionStorage.setItem('late','yes'));
  await h.navigate(h.base+'/ordering');const absent=await snap();check('new document with targets withheld after comment storage read',absent.timeOrigin!==initial.timeOrigin&&absent.targets.length===0&&absent.pins.length===0,absent);
  const stored=await h.send('SP_GET_CHANGES');check('saved comments available before target release',JSON.stringify(stored).includes('ordering heading'),stored);
  await h.content(()=>window.mountTargets());await h.wait(500);const late=await snap();
  check('late target insertion restores both pins without scroll or another storage read',late.pins.length===2,late);
  check('saved target identities preserved',late.targets.every(e=>e.dm===initial.targets.find(x=>x.id===e.id).dm),{initial,late});
  check('resolved state survives delayed reload',late.pins.some(p=>p.opacity==='0.6'),late);
  check('pins use restored target rectangles',late.targets.every(t=>late.pins.some(p=>Math.abs(parseFloat(p.left)-(t.rect.right-14))<0.01&&Math.abs(parseFloat(p.top)-(t.rect.top-14))<0.01)),late);
  await h.content(()=>sessionStorage.removeItem('late'));await h.navigate(h.base+'/ordering');const early=await snap();check('target-before-storage ordering restores both pins',early.pins.length===2,early);
  await h.content(()=>sessionStorage.setItem('late','yes'));await h.navigate(h.base+'/ordering');await h.navigate(h.base+'/different-route');await h.content(()=>window.mountTargets());await h.wait(500);const cancelled=await snap();check('navigation cancels prior-page pins',cancelled.pins.length===0,cancelled);
 }catch(e){error=String(e);throw e}finally{fs.writeFileSync(h.out+'/ordering-row.json',JSON.stringify({pair:(h.driver?'firefox':'chrome')+':6.7',version:h.version,status:error||assertions.some(x=>!x.ok)?'failed':'pass',error,assertions},null,2))}
};
