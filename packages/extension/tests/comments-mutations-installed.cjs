const fs = require('node:fs'), assert = require('node:assert/strict');
const A = require('./certification/panel-actions.cjs');
module.exports = async h => {
  const rows = []; const check = (label, ok, evidence) => { rows.push({label, ok: !!ok, evidence}); assert(ok, label); };
  const snap = () => h.content(() => { const p = document.querySelector('.dm-comment-pin'); return p ? { left: parseFloat(p.style.left), top: parseFloat(p.style.top) } : null; });
  try {
    await h.panel(A.showDesign);
    await h.content(() => { document.getElementById('heading').style.cssText = 'position:absolute;left:100px;top:100px;width:120px;height:60px;margin:0'; });
    await h.select('heading'); await h.action('comment');
    await h.panel(A.inputSelector, {selector:'[data-dm-comment-input]', value:'Synthetic cold review drag'}); await h.action('submit-comment');
    await h.page.keyboard.press('Escape'); await h.wait(100);
    const before = await snap(); check('installed real panel creates anchored comment', !!before, before);
    const expected = {left: before.left + 50, top: before.top + 30};
    await h.page.mouse.move(before.left + 14, before.top + 14); await h.page.mouse.down(); await h.page.mouse.move(expected.left + 14, expected.top + 14);
    await h.content(() => { document.getElementById('copy').className = 'during-drag'; const e=document.getElementById('dm-hover'); if(e)e.style.left='7px'; }); await h.wait(100);
    check('installed active drag survives unrelated mutations', JSON.stringify(await snap()) === JSON.stringify(expected), {expected, actual:await snap(), viewport:await h.content(()=>({width:innerWidth,height:innerHeight, rect:document.getElementById('heading').getBoundingClientRect().toJSON(),pin:document.querySelector('.dm-comment-pin').outerHTML}))});
    await h.page.mouse.up(); await h.wait(200);
    const stored = await h.send('SP_GET_CHANGES');
    check('real background acknowledges offset 50/30', stored.comments?.some(c => c.pinOffset?.x === 50 && c.pinOffset?.y === 30), stored.comments);
    await h.content(() => { document.getElementById('copy').className = 'after-ack'; }); await h.wait(100);
    check('installed saved drag survives unrelated mutation', JSON.stringify(await snap()) === JSON.stringify(expected), await snap());
    const sw = h.context.serviceWorkers()[0];
    // Browser page-world measurement cannot see isolated-world DOM method calls.
    await sw.evaluate(async tabId => {
      await chrome.scripting.executeScript({target:{tabId},func:()=>{
        globalThis.__commentCost={rects:0,queries:0,stamps:0};
        const r=Element.prototype.getBoundingClientRect,q=document.querySelectorAll.bind(document),s=Element.prototype.setAttribute;
        Element.prototype.getBoundingClientRect=function(){__commentCost.rects++;return r.call(this)};
        document.querySelectorAll=function(...a){__commentCost.queries++;return q(...a)};
        Element.prototype.setAttribute=function(...a){if(a[0]==='data-dm-id')__commentCost.stamps++;return s.apply(this,a)};
      }});
      return true;
    },h.tabId);
    await h.content(async () => { let e=document.getElementById('dm-hover'); if(!e){e=document.createElement('div');e.id='dm-hover';document.documentElement.append(e)} for(let i=0;i<20;i++){e.style.left=i+'px';await new Promise(r=>setTimeout(r,20))} });
    const measured = await sw.evaluate(async tabId => (await chrome.scripting.executeScript({target:{tabId},func:()=>globalThis.__commentCost}))[0].result,h.tabId);
    check('installed hover mutations do no comment anchor work', measured.rects===0&&measured.queries===0&&measured.stamps===0, measured);
    const target = await h.content(() => { const e=document.getElementById('heading'),html=e.outerHTML;e.remove();return html; }); await h.wait(100);
    check('installed missing anchor removes pin', await snap() === null);
    await h.content(html => { document.body.insertAdjacentHTML('beforeend',html.replace(/ data-dm-id="[^"]*"/,'')); },target); await h.wait(100);
    check('installed late anchor restores saved drag',JSON.stringify(await snap())===JSON.stringify(expected),await snap());
    await h.screenshot('comments-installed');
    await h.content(() => { history.pushState({},'','/different-route'); }); await h.wait(1000);
    check('installed navigation removes prior-page pin',await snap()===null);
  } finally {
    fs.writeFileSync(h.out+'/comments-installed.json',JSON.stringify({version:h.version,transport:'installed content + real background storage + real panel + Playwright mouse',rows},null,2));
    console.log(JSON.stringify(rows,null,2));
  }
};
