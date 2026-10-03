const panelActions = require('./panel-actions.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async h=>{
 const {panel,content,navigate,select,action,base,out,wait,screenshot,send}=h;const results=[];
 const click=async s=>{await panel(panelActions.clickSelector, s);await wait(300)};
 const input=async(s,v)=>{await panel(panelActions.inputSelector, {selector:s,value:v});await wait(600)};
 const test=async(id,fn)=>{let r={id};try{r.evidence=await fn();r.status='pass'}catch(e){r.status='fail';r.error=String(e)}results.push(r);fs.writeFileSync(out+'/corrections.json',JSON.stringify(results,null,2));console.log(r)};
 await navigate(base+'/corrections');await select('heading');await action('settings');
 await test('0.5.8',async()=>{await click('[data-dm-input-unit="rem"]');await input('[data-dm-setting="nudge-amount"]','25');await input('[data-dm-setting="marginColor"]','#112233');await input('[data-dm-setting="paddingColor"]','#223344');await action('reset-settings');const r=await panel(panelActions.resetSettingsEvidence);fs.writeFileSync(out+'/reset-observed.json',JSON.stringify(r,null,2));assert.deepEqual(r.values,['10','#ff6363','#7cc886']);assert.deepEqual(r.saved,{});return r});
 await action('settings');await action('open-tokens');await wait(600);
 await test('8.4',async()=>{await input('[data-dm-token-edit="--space"]','20px');assert.equal(await content(() => { return getComputedStyle(document.querySelector('#card')).paddingTop }),'20px');await click('[data-dm-token-reset="--space"]');assert.equal(await content(() => { return getComputedStyle(document.querySelector('#card')).paddingTop }),'8px');const r=await send('SP_GET_CHANGES');assert.equal(r.tokenChanges.length,0);return {reset:'20px → 8px',remainingTokens:r.tokenChanges}});
 await action('close-tokens');
 for(const kind of ['data','http'])await test('4.6-'+kind,async()=>{await content((kind) => { const e=document.querySelector('#backdrop');if(kind==='http')e.style.backgroundImage='url('+location.origin+'/fixture.svg)';e.scrollIntoView();return true }, kind);await select('heading');await select('backdrop');await wait(500);const r={media:await send('SP_GET_MEDIA'),controls:await panel(panelActions.backgroundControls)};fs.writeFileSync(out+'/background-'+kind+'.json',JSON.stringify(r,null,2));assert(r.media.media?.kind==='background');assert(r.controls.download);const before=fs.readdirSync(out);await action('download-media');await wait(1500);r.downloads=fs.readdirSync(out).filter(n=>!before.includes(n)&&!n.endsWith('.part'));assert(r.downloads.length>0,'Download must complete in disposable output directory');r.bytes=r.downloads.map(n=>fs.readFileSync(out+'/'+n,'utf8'));assert(r.bytes.some(s=>s.includes('<svg')));return r});
 await screenshot('corrections-final');
 assert(results.every(r=>r.status==='pass'), 'Native correction regression failed; see corrections.json');
};
