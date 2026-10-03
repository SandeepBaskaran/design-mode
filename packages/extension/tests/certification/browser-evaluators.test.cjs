const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const elements = new Map();
const panelDocument = { querySelector: selector => elements.get(selector) };
global.content = { document: panelDocument, Event: class Event { constructor(type) { this.type = type; } } };
const actions = require('./panel-actions.cjs');
const { createChromeEvaluators, createFirefoxPanel } = require('./browser-evaluators.cjs');
delete global.content;

test('Chrome forwards real functions and structured arguments without compiling strings', async () => {
  const calls = [];
  const remote = { evaluate: (fn, arg) => { calls.push({ fn, arg }); return fn(arg); } };
  const { panel, content } = createChromeEvaluators(remote, remote);
  const payload = { text: "'); globalThis.injected = true; //", nested: ['`', '${code}'] };
  const identity = arg => arg;
  assert.equal(await panel(identity, payload), payload);
  assert.equal(await content(identity, payload), payload);
  assert.equal(calls[0].fn, identity);
  assert.equal(calls[1].arg, payload);
  assert.throws(() => panel('return true'), /requires a function/);
  assert.throws(() => content('return true'), /requires a function/);
  assert.equal(global.injected, undefined);
});

test('fixed input action treats quotes, backticks and interpolation as text', async () => {
  const events = [];
  const element = { focus() {}, blur() {}, dispatchEvent(e) { events.push(e.type); } };
  const selector = '[data-test="input"]';
  const value = "';throw new Error(`injected ${value}`);//";
  elements.set(selector, element);
  await actions.inputSelector({ selector, value });
  assert.equal(element.value, value);
  assert.deepEqual(events, ['input', 'change']);
  await assert.rejects(actions.clickSelector('#missing'), /Missing #missing/);
});

test('Firefox sends only allowlisted action names and data, correlates replies and cleans listeners', async () => {
  const listeners = new Map(), requests = [], loaded = [];
  const mm = {
    addMessageListener: (name, fn) => listeners.set(name, fn),
    removeMessageListener: name => listeners.delete(name),
    loadFrameScript(url, delayed) {
      loaded.push({ url, delayed });
      listeners.get('dm-certification:ready')();
    },
    sendAsyncMessage(name, request) {
      assert.equal(name, 'dm-certification:request');
      requests.push(request);
      const reply = listeners.get('dm-certification:reply');
      reply({ data: { id: -1, value: 'wrong request' } });
      reply({ data: request.arg === 'fail' ? { id: request.id, error: 'action failed' } : { id: request.id, value: request.arg } });
    },
  };
  global.document = { getElementById: () => ({ contentDocument: { getElementById: () => ({ messageManager: mm }) } }) };
  const contexts = [];
  const driver = {
    setContext: async name => contexts.push(name),
    executeAsyncScript(fn, arg) {
      assert.equal(typeof fn, 'function');
      return new Promise(resolve => fn(arg, resolve));
    },
  };
  try {
    const panel = await createFirefoxPanel(driver, 'file:///fixture/panel-actions.cjs');
    const arg = { selector: "');throw 1;//", value: '${untrusted}' };
    assert.equal(await panel(actions.inputSelector, arg), arg);
    assert.deepEqual(requests[0], { id: 1, action: 'inputSelector', arg });
    await assert.rejects(panel(() => true), /registered fixed action/);
    await assert.rejects(panel('return true'), /requires a function/);
    await assert.rejects(panel(actions.panelText, 'fail'), /action failed/);
    assert.deepEqual(loaded, [{ url: 'file:///fixture/panel-actions.cjs', delayed: false }]);
    assert.equal(listeners.size, 0);
    assert.ok(contexts.every(name => name === 'chrome'));
  } finally { delete global.document; }
});

test('harness and reused modules have no string evaluation callsites', () => {
  const files = ['../acceptance-installed.cjs', 'browser-evaluators.cjs', 'panel-actions.cjs', 'chrome-corrections.cjs', 'firefox-corrections.cjs', 'mcp-installed.cjs'];
  for (const file of files) {
    const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
    assert.doesNotMatch(source, /\b(?:eval|Function)\s*\(/, file);
    assert.doesNotMatch(source, /\b(?:panel|content|evaluate|executeScript|executeAsyncScript)\s*\(\s*['"`]/, file);
  }
});
