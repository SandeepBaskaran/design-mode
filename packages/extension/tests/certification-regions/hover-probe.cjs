const fs=require('node:fs'),path=require('node:path'),A=require('../certification/panel-actions.cjs');
module.exports=async h=>{
 const {By}=require('selenium-webdriver'),results=[];
 await h.navigate(h.base+'/hover-probe');await h.select('motion');
 await h.content(()=>{window.__moves=[];document.addEventListener('pointermove',e=>window.__moves.push({x:e.clientX,y:e.clientY,target:e.target.id}));});
 const sample=async label=>{results.push({label,data:await h.content(()=>({hover:[...document.querySelectorAll(':hover')].map(e=>e.id),events:window.__moves.splice(0),parking:document.querySelector('#parking').getBoundingClientRect().toJSON(),motion:document.querySelector('#motion').getBoundingClientRect().toJSON()}))})};
 for(const target of ['parking','motion','parking']){await h.content(()=>true);await h.driver.actions({async:true}).move({origin:await h.driver.findElement(By.id(target))}).perform();await h.wait(400);await sample('element-'+target);await h.panel(A.inspectSelector,'body');await sample('after-panel-'+target);}
 await h.content(()=>true);await h.driver.actions({async:true}).move({origin:'viewport',x:100,y:200}).perform();await sample('absolute100,200');
 await h.content(()=>true);await h.driver.actions({async:true}).move({origin:'viewport',x:400,y:100}).perform();await sample('absolute400,100');
 fs.writeFileSync(path.join(h.out,'probe.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
};