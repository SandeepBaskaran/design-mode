const { buildSync } = require('esbuild');
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
(async () => {
  const pkg = path.resolve(__dirname, '..');
  const source = process.env.COMMENTS_SOURCE ? fs.readFileSync(process.env.COMMENTS_SOURCE, 'utf8') : "export * from './comments';";
  const code = buildSync({ stdin: { contents: source, resolveDir: path.join(pkg, 'src/content'), loader: 'ts' }, bundle: true, write: false, format: 'iife', globalName: 'Probe', tsconfig: path.join(pkg, 'tsconfig.json') }).outputFiles[0].text;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BINARY, headless: true });
  const rows = [];
  const check = (label, ok, evidence) => rows.push({ label, ok: !!ok, evidence });
  try {
    const p = await browser.newPage();
    await p.route('**/*', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="target" style="position:absolute;left:100px;top:100px;width:120px;height:60px"></div><div id="unrelated"></div><div id="dm-hover"></div>' }));
    await p.goto('http://localhost/comments');
    await p.evaluate(() => {
      window.reads = 0; window.hold = false; window.pending = [];
      window.stored = [{ id: 'a', elementId: 'dm-80', selector: '#target', text: 'drag', timestamp: 1, updatedAt: 1, pageUrl: location.href }];
      window.browser = { runtime: { sendMessage: async ({ operation: o }) => {
        if (o.kind === 'read') { reads++; return { ok: true, comments: structuredClone(stored) }; }
        if (hold) await new Promise(r => pending.push(r));
        if (o.kind === 'offset') stored = stored.map(c => c.id === o.id ? { ...c, pinOffset: o.offset } : c);
        return { ok: true, comments: structuredClone(stored), comment: structuredClone(stored.find(c => c.id === o.id)) };
      } } };
    });
    await p.addScriptTag({ content: code });
    await p.evaluate(async () => {
      window.addEventListener('dm-comment-pin-dragged', e => { window.saved = Probe.setCommentPinOffset(e.detail.commentId, e.detail.offset); });
      await Probe.showAllPins();
    });
    const tick = () => p.waitForTimeout(55);
    const pos = () => p.locator('.dm-comment-pin').evaluate(e => ({ left: e.style.left, top: e.style.top }));
    await tick();
    await p.mouse.move(220, 100); await p.mouse.down(); await p.mouse.move(270, 130);
    const active = { left: '256px', top: '116px' };
    check('pointermove reaches requested drag position', JSON.stringify(await pos()) === JSON.stringify(active), await pos());
    await p.evaluate(() => { document.querySelector('#unrelated').className = 'active'; document.querySelector('#dm-hover').style.left = '3px'; }); await tick();
    check('active drag survives page and overlay mutations', JSON.stringify(await pos()) === JSON.stringify(active), { active, after: await pos() });
    await p.evaluate(() => { hold = true; }); await p.mouse.up();
    await p.evaluate(() => { document.querySelector('#unrelated').className = 'pending'; }); await tick();
    check('unacknowledged drag survives mutation', JSON.stringify(await pos()) === JSON.stringify(active), await pos());
    await p.evaluate(async () => { hold = false; pending.splice(0).forEach(r => r()); await saved; }); await tick();
    await p.evaluate(() => { document.querySelector('#unrelated').className = 'saved'; }); await tick();
    check('acknowledged drag remains at pointer position', JSON.stringify(await pos()) === JSON.stringify(active), { active, after: await pos(), stored: await p.evaluate(() => stored[0].pinOffset) });
    await p.evaluate(() => { window.dispatchEvent(new Event('scroll')); window.dispatchEvent(new Event('resize')); }); await tick();
    check('geometry reconciliation does not reread storage', await p.evaluate(() => reads) === 1, await p.evaluate(() => reads));
    let pinWrites = 0;
    await p.evaluate(() => { window.pinMutationCount = 0; window.pinObserver = new MutationObserver(r => { pinMutationCount += r.length; }); pinObserver.observe(document.querySelector('.dm-comment-pin'), {attributes:true, childList:true, subtree:true}); });
    const costs = await p.evaluate(async () => {
      let rects = 0, queries = 0, stamps = 0;
      const rect = Element.prototype.getBoundingClientRect, query = document.querySelectorAll.bind(document), attr = Element.prototype.setAttribute;
      Element.prototype.getBoundingClientRect = function () { rects++; return rect.call(this); };
      document.querySelectorAll = function (...a) { queries++; return query(...a); };
      Element.prototype.setAttribute = function (...a) { if (a[0] === 'data-dm-id') stamps++; return attr.apply(this, a); };
      for (let i = 0; i < 20; i++) { document.getElementById('dm-hover').style.left = i + 'px'; await new Promise(r => setTimeout(r, 20)); }
      const overlay = { rects, queries, stamps }; rects = queries = stamps = 0;
      document.getElementById('unrelated').className = 'ordinary'; await new Promise(r => setTimeout(r, 55));
      const ordinary = { rects, queries, stamps };
      Element.prototype.getBoundingClientRect = rect; document.querySelectorAll = query; Element.prototype.setAttribute = attr;
      return { overlay, ordinary };
    });
    pinWrites = await p.evaluate(() => { pinObserver.disconnect(); return pinMutationCount; });
    check('unchanged pins receive no DOM writes', pinWrites === 0, pinWrites);
    check('overlay mutations do no anchor work', Object.values(costs.overlay).every(n => n === 0), costs.overlay);
    check('unchanged anchors are not restamped', costs.ordinary.stamps === 0, costs.ordinary);
    await p.evaluate(() => { document.getElementById('target').remove(); }); await tick();
    check('missing anchor removes its pin', await p.locator('.dm-comment-pin').count() === 0);
    await p.evaluate(() => { const e = document.createElement('div'); e.id = 'target'; e.style.cssText = 'position:absolute;left:100px;top:100px;width:120px;height:60px'; document.body.append(e); }); await tick();
    check('late anchor restores saved drag without storage read', JSON.stringify(await pos()) === JSON.stringify(active), await pos());
    await p.evaluate(() => { const e = document.createElement('div'); e.dataset.dmId = 'dm-80'; e.id = 'collision'; document.body.append(e); }); await tick();
    check('duplicate saved ID refuses ambiguous anchor', await p.locator('.dm-comment-pin').count() === 0);
    await p.evaluate(() => { document.getElementById('collision').remove(); }); await tick();
    check('removing collision restores pin', await p.locator('.dm-comment-pin').count() === 1);
    await p.evaluate(() => { document.getElementById('unrelated').className = 'queued'; history.pushState({}, '', '/new'); }); await tick();
    check('navigation cancels queued geometry', await p.locator('.dm-comment-pin').count() === 0);
    await p.evaluate(async () => { history.pushState({}, '', '/comments'); await Probe.showAllPins(); document.getElementById('unrelated').className = 'queued-again'; Probe.hideAllPins(); }); await tick();
    check('hide cancels queued geometry', await p.locator('.dm-comment-pin').count() === 0);
    await p.evaluate(async () => {
      await Probe.showAllPins(); hold = true;
      window.oldSave = Probe.setCommentPinOffset('a', {x:100,y:100});
      Probe.hideAllPins(); stored[0].pinOffset = {x:10,y:10};
      await Probe.showAllPins(); hold = false; pending.splice(0).forEach(r => r()); await oldSave;
      document.getElementById('unrelated').className = 'after-old-ack';
    }); await tick();
    check('old offset acknowledgement cannot replace a new generation', JSON.stringify(await pos()) === JSON.stringify({left:'216px',top:'96px'}), await pos());
    await p.evaluate(async () => {
      hold = true; window.oldSave = Probe.setCommentPinOffset('a', {x:200,y:200});
      history.pushState({}, '', '/away'); Probe.hideAllPins();
      hold = false; pending.splice(0).forEach(r => r()); await oldSave;
    }); await tick();
    check('late offset acknowledgement after navigation cannot resurrect pins', await p.locator('.dm-comment-pin').count() === 0);
  } finally { await browser.close(); }
  const result = { transport: 'mocked store, real Chromium pointer and DOM', rows };
  if (process.env.COMMENTS_OUT) fs.writeFileSync(process.env.COMMENTS_OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2)); assert(rows.every(r => r.ok));
})().catch(e => { console.error(e); process.exitCode = 1; });
