const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function lifecycleProbe({ base, inject = false, arm = false }) {
  const api = window.wrappedJSObject?.browser || window.browser || window.chrome;
  const tab = (await api.tabs.query({})).find(t => t.url?.startsWith(base));
  if (inject) await Promise.all(Array.from({ length: 3 }, () => api.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content.js'] })));
  const [result] = await api.scripting.executeScript({
    target: { tabId: tab.id },
    func: (arm) => {
      if (arm && !globalThis.__lifecycleProbe) {
        const counts = { dom: 0, messages: 0, loads: 0 };
        globalThis.__lifecycleProbe = counts;
        const add = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (...args) { counts.dom++; return add.apply(this, args); };
        const api = globalThis.browser || globalThis.chrome;
        const listen = api.runtime.onMessage.addListener.bind(api.runtime.onMessage);
        api.runtime.onMessage.addListener = function (...args) { counts.messages++; return listen(...args); };
        const log = console.log;
        console.log = function (...args) { if (String(args[0]).includes('Content script loaded')) counts.loads++; return log.apply(this,args); };
      }
      return { token: window.__dmActiveInstance, counts: globalThis.__lifecycleProbe, overlays: [...document.querySelectorAll('[id^="dm-"]')].map(e => e.id) };
    },
    args: [arm],
  });
  return result.result;
}

module.exports = async ({ panelPage, context, content, driver, base, out, version, navigate, select, send, wait }) => {
  const checks = [];
  async function probe(args) {
    if (!driver) return panelPage.evaluate(lifecycleProbe, {base,...args});
    await driver.setContext('chrome');
    return driver.executeAsyncScript(function (source, args, done) {
      const mm = document.getElementById('sidebar').contentDocument.getElementById('webext-panels-browser').messageManager;
      const topic = 'dm-lifecycle-result';
      const listener = message => { mm.removeMessageListener(topic, listener); done(message.data); };
      mm.addMessageListener(topic, listener);
      mm.loadFrameScript('data:application/javascript,' + encodeURIComponent(source + '\nlifecycleProbe(' + JSON.stringify(args) + ').then(value => sendAsyncMessage("dm-lifecycle-result", value), error => sendAsyncMessage("dm-lifecycle-result", {error:String(error)}));'), false);
    }, 'const window=content;\n' + lifecycleProbe.toString(), {base,...args});
  }
  const check = (label, ok, evidence) => checks.push({label,ok,evidence});
  for (const phase of ['initial', 'document-reload']) {
    if (phase !== 'initial') await navigate(base + '/reloaded');
    await select('heading');
    const before = await probe({arm:true});
    const after = await probe({inject:true});
    check(phase + ': repeated/concurrent fallback preserves one instance and registers nothing', before.token === after.token && after.counts.dom === before.counts.dom && after.counts.messages === before.counts.messages && after.counts.loads === 0, {before,after});
    const disabled = await send('SP_DEACTIVATE_DESIGN_MODE'); await wait(100);
    const enabled = await send('SP_ACTIVATE_DESIGN_MODE'); await wait(100);
    check(phase + ': disable/reactivate actually changes lifecycle state', disabled.enabled === false && enabled.enabled === true, {disabled,enabled});
    await select('heading');
    const reopen = await probe({});
    check(phase + ': reopen and selection retain instance without duplicate overlay IDs', reopen.token === after.token && new Set(reopen.overlays).size === reopen.overlays.length, reopen);
  }
  const originalSize = await content(() => { const r = document.getElementById('heading').getBoundingClientRect(); return {width:r.width,height:r.height}; });
  await content(() => {
    const dot = document.getElementById('dm-resize-dots').children[4];
    const r = dot.getBoundingClientRect();
    dot.dispatchEvent(new MouseEvent('mousedown', {bubbles:true,clientX:r.x,clientY:r.y}));
    document.dispatchEvent(new MouseEvent('mousemove', {bubbles:true,clientX:r.x+40,clientY:r.y+40}));
  });
  await wait(200);
  const previewSize = await content(() => { const r = document.getElementById('heading').getBoundingClientRect(); return {width:r.width,height:r.height}; });
  await send('SP_DEACTIVATE_DESIGN_MODE');
  await wait(200);
  await content(() => document.dispatchEvent(new MouseEvent('mouseup', {bubbles:true})));
  await send('SP_ACTIVATE_DESIGN_MODE');
  await wait(200);
  await select('heading');
  const restoredSize = await content(() => { const r = document.getElementById('heading').getBoundingClientRect(); return {width:r.width,height:r.height}; });
  check('disable during resize clears USER preview and late mouseup cannot commit', previewSize.width > originalSize.width && JSON.stringify(originalSize) === JSON.stringify(restoredSize), {originalSize,previewSize,restoredSize});
  const beforeClose = await probe({});
  if (driver) {
    await driver.setContext('chrome');
    await driver.executeScript(() => SidebarController.hide());
    await wait(300);
    await driver.executeAsyncScript(function (done) { SidebarController.show('sandeepbaskaran98_gmail_com-sidebar-action').then(() => done()); });
  } else {
    const url = panelPage.url();
    await panelPage.close();
    await wait(300);
    panelPage = await context.newPage();
    await panelPage.goto(url);
  }
  await wait(1500);
  await select('heading');
  const afterOpen = await probe({inject:true});
  check('panel close/reopen retains singleton and usable selection overlay', afterOpen.token === beforeClose.token && afterOpen.counts.messages === beforeClose.counts.messages && afterOpen.overlays.includes('dm-select') && new Set(afterOpen.overlays).size === afterOpen.overlays.length, {beforeClose,afterOpen});
  fs.writeFileSync(path.join(out,'lifecycle.json'),JSON.stringify({version,checks},null,2));
  assert.ok(checks.every(c=>c.ok), JSON.stringify(checks));
};
