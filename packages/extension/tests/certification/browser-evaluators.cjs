const panelActions = require('./panel-actions.cjs');

function requireFunction(fn) {
  if (typeof fn !== 'function') throw new TypeError('Browser evaluation requires a function');
}

function createChromeEvaluators(panelPage, page) {
  return {
    panel(fn, arg) {
      requireFunction(fn);
      return panelPage.evaluate(fn, arg);
    },
    content(fn, arg) {
      requireFunction(fn);
      return page.evaluate(fn, arg);
    },
  };
}

async function createFirefoxPanel(driver, frameScriptUrl) {
  await driver.setContext('chrome');
  const ready = await driver.executeAsyncScript(function (url, done) {
    const mm = document.getElementById('sidebar').contentDocument.getElementById('webext-panels-browser').messageManager;
    const timer = setTimeout(() => {
      mm.removeMessageListener('dm-certification:ready', onReady);
      done({ error: 'Sidebar dispatcher initialization timed out' });
    }, 10000);
    function onReady() {
      clearTimeout(timer);
      mm.removeMessageListener('dm-certification:ready', onReady);
      done({ ready: true });
    }
    mm.addMessageListener('dm-certification:ready', onReady);
    mm.loadFrameScript(url, false);
  }, frameScriptUrl);
  if (ready.error) throw new Error(ready.error);
  let nextId = 0;
  return async (fn, arg) => {
    requireFunction(fn);
    const action = Object.keys(panelActions).find(name => panelActions[name] === fn);
    if (!action) throw new TypeError('Firefox panel requires a registered fixed action');
    await driver.setContext('chrome');
    const result = await driver.executeAsyncScript(function (request, done) {
      const mm = document.getElementById('sidebar').contentDocument.getElementById('webext-panels-browser').messageManager;
      const timer = setTimeout(() => {
        mm.removeMessageListener('dm-certification:reply', onReply);
        done({ error: 'Sidebar action timed out: ' + request.action });
      }, 10000);
      function onReply(message) {
        if (message.data.id !== request.id) return;
        clearTimeout(timer);
        mm.removeMessageListener('dm-certification:reply', onReply);
        done(message.data);
      }
      mm.addMessageListener('dm-certification:reply', onReply);
      mm.sendAsyncMessage('dm-certification:request', request);
    }, { id: ++nextId, action, arg: arg ?? null });
    if (result.error) throw new Error(result.error);
    return result.value;
  };
}

module.exports = { createChromeEvaluators, createFirefoxPanel };
