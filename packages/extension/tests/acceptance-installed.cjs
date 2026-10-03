// Real installed extension; Firefox uses its native sidebar, Chrome a bound panel tab.
// Dependencies are supplied via NODE_PATH; only task-owned disposable profiles are used.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const panelActions = require('./certification/panel-actions.cjs');
const { createChromeEvaluators, createFirefoxPanel } = require('./certification/browser-evaluators.cjs');
const root = path.resolve(__dirname, '../../..');
const out = path.resolve(process.env.DM_ACCEPTANCE_OUT || path.join(root, '.acceptance-installed'));
fs.mkdirSync(out, { recursive: true });
const target = process.argv[2] || 'firefox';
const checks = [];
let driver, context, page, panelPage, tabId, fixture, profile;
const wait = ms => new Promise(r => setTimeout(r, ms));
const check = (ok, label, evidence) => { checks.push({ label, ok: !!ok, evidence }); assert.ok(ok, label); };
let panel, content, navigate, select, screenshot;
(async () => {
  fixture = http.createServer((req, res) => {
    if (req.url === '/fixture.svg') {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/></svg>');
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    if (process.env.DM_CERTIFICATION_FIXTURE) { res.end(fs.readFileSync(process.env.DM_CERTIFICATION_FIXTURE)); return; }
    res.end('<!doctype html><title>Installed acceptance fixture</title><style>body{font-family:sans-serif;padding:30px}h1{font-size:32px}</style><h1 id="heading">Acceptance heading</h1><p id="copy">Synthetic copy</p><div id="hide">Hide me</div><div id="delete">Delete me</div>');
  });
  await new Promise(r => fixture.listen(0, '127.0.0.1', r));
  const base = `http://localhost:${fixture.address().port}`;
  profile = fs.mkdtempSync(path.join(out, target + '-profile-'));
  const dist = path.resolve(process.env.DM_EXTENSION_DIST || path.join(root, 'packages/extension/dist'));
  let version;
  if (target === 'firefox') {
    const { Builder, By } = require('selenium-webdriver'), ff = require('selenium-webdriver/firefox');
    const options = new ff.Options()

      .setPreference('browser.download.folderList', 2)
      .setPreference('browser.download.dir', out)
      .setPreference('browser.download.useDownloadDir', true)
      .setPreference('browser.helperApps.neverAsk.saveToDisk', 'image/svg+xml,image/png,application/octet-stream')
      .setPreference('network.proxy.type', 1).setPreference('network.proxy.http', '127.0.0.1').setPreference('network.proxy.http_port', 9)
      .setPreference('network.proxy.ssl', '127.0.0.1').setPreference('network.proxy.ssl_port', 9)
      .setPreference('network.proxy.no_proxies_on', 'localhost,127.0.0.1');
    if (process.env.DM_HEADED !== '1') options.addArguments('-headless');
    if (process.env.FIREFOX_BINARY) options.setBinary(process.env.FIREFOX_BINARY);
    const service = new ff.ServiceBuilder(process.env.GECKODRIVER).addArguments('--allow-system-access', '--profile-root', profile);
    driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).setFirefoxService(service).build();
    version = (await driver.getCapabilities()).get('browserVersion');
    await driver.installAddon(dist, true);
    const handle = (await driver.getAllWindowHandles())[0];
    content = async (fn, arg) => {
      if (typeof fn !== 'function') throw new TypeError('Content evaluation requires a function');
      await driver.setContext('content'); await driver.switchTo().window(handle);
      return driver.executeScript(fn, arg ?? null);
    };
    navigate = async url => { await driver.setContext('content'); await driver.switchTo().window(handle); await driver.get(url); await wait(1500); };
    select = async id => { await content(() => { return true }); await driver.findElement(By.id(id)).click(); await wait(350); };
    await navigate(base + '/mixed');
    await driver.setContext('chrome');
    await driver.executeAsyncScript(function (done) {
      SidebarController.show('sandeepbaskaran98_gmail_com-sidebar-action').then(() => done());
    });
    const dispatcher = fs.readFileSync(path.join(__dirname, 'certification/panel-actions.cjs'));
    panel = await createFirefoxPanel(driver, 'data:application/javascript;base64,' + dispatcher.toString('base64'));
    screenshot = async name => { await driver.setContext('chrome'); fs.writeFileSync(path.join(out, name + '.png'), await driver.takeScreenshot(), 'base64'); };
  } else {
    const { chromium } = require('playwright');
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.CHROME_BINARY,
      headless: process.env.DM_HEADED !== '1', args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=localhost;127.0.0.1'],
    });
    await context.route('**/*', r => { const u = new URL(r.request().url()); return ['localhost', '127.0.0.1'].includes(u.hostname) || u.protocol === 'chrome-extension:' || (process.env.DM_CERTIFICATION_FIXTURE && u.href === require('node:url').pathToFileURL(path.resolve(process.env.DM_CERTIFICATION_FIXTURE)).href) ? r.continue() : r.abort(); });
    const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    page = await context.newPage(); await page.goto(base + '/mixed');
    version = await page.evaluate(() => navigator.userAgent);
    tabId = await sw.evaluate(async base => (await chrome.tabs.query({})).find(t => t.url?.startsWith(base)).id, base);
    panelPage = await context.newPage(); await panelPage.goto(sw.url().replace('/background.js', '/sidepanel/index.html?tab=' + tabId));
    ({ panel, content } = createChromeEvaluators(panelPage, page));
    navigate = async url => { await page.goto(url); await wait(1500); };
    select = async id => { await page.locator('#' + id).click(); await wait(350); };
    screenshot = name => panelPage.screenshot({ path: path.join(out, name + '.png') });
  }
  await wait(1500);
  const send = (type, payload = {}) => panel(panelActions.sendMessage, {base, message: {type, ...payload}});
  const action = async action => { await panel(panelActions.clickAction, action); await wait(350); };
  const panelText = () => panel(panelActions.panelText);
  const read = () => content(() => { const s=getComputedStyle(document.querySelector('#heading'));return {font:s.fontSize,opacity:s.opacity,radius:s.borderRadius,headingVisibility:s.visibility,hidden:getComputedStyle(document.querySelector('#hide')).visibility,deleted:!document.querySelector('#delete')} });
  if (process.env.DM_CERTIFICATION_MODULE) {
    await require(path.resolve(process.env.DM_CERTIFICATION_MODULE))({ context, page, panelPage, panel, content, navigate, select, action, send, base, out, version, tabId, wait, screenshot, driver, panelText });
    return;
  }
  if (process.env.DM_ACCEPTANCE_SCENARIO !== 'navigation') {
  await select('heading');
  for (const [prop, value] of [['fontSize', '50'], ['__opacity_pct', '75'], ['borderRadius', '10']]) {
    await panel(panelActions.editProperty, {prop,value}); await wait(350);
  }
  await select('hide'); await panel(panelActions.hideElement);
  await select('delete'); await action('delete'); await wait(500);
  const before = await read();
  check(require('node:util').isDeepStrictEqual(before, { font: '50px', opacity: '0.75', radius: '10px', headingVisibility: 'visible', hidden: 'hidden', deleted: true }), 'native controls apply five mixed changes', before);
  await screenshot(target + '-mixed-before');
  // Only this fixture's synthetic session key is read, never credentials/settings.
  const key = 'dm_session:' + base + '/mixed';
  const saved = await panel(panelActions.readSession, key);
  const stored = JSON.parse(saved), payload = stored.session || stored.local;
  check(payload.domChanges[0].origin.parentSelector === 'body', 'persisted body origin is a valid selector', { origin: payload.domChanges[0].origin, styles: payload.styleChanges.length, dom: payload.domChanges.length });
  await navigate(base + '/mixed');
  const after = await read(); check(JSON.stringify(before) === JSON.stringify(after), 'mixed changes survive document reload', after);
  await screenshot(target + '-mixed-after');
  // The pre-fix saved format is repaired only on internal replay, not file import.
  await panel(panelActions.seedLegacyOrigin, {key,session:!!stored.session});
  await navigate(base + '/mixed');
  check(JSON.stringify(before) === JSON.stringify(await read()), 'legacy empty body origin replays all five changes');
  }
  await navigate(base + '/a'); await select('heading'); await action('comment');
  await panel(panelActions.commentOnPageA);
  await action('submit-comment');
  await panel(panelActions.showChanges); await wait(200);
  check((await panelText()).includes('Only page A'), 'comment visible in Changes on A');
  for (const suffix of ['/a', '/b', '/a?variant=1', '/a#hash', '/a']) {
    await navigate(base + suffix);
    const expected = suffix === '/a';
    const text = await panelText(), changes = await send('SP_GET_CHANGES'), exported = await send('SP_EXPORT', { format: 'markdown' });
    check(text.includes('Only page A') === expected && changes.comments.some(c => c.text === 'Only page A') === expected && JSON.stringify(exported).includes('Only page A') === expected, 'Changes and handoff export document scope ' + suffix, { commentCount: changes.comments.length, panelHasComment: text.includes('Only page A'), exportHasComment: JSON.stringify(exported).includes('Only page A') });
  }
  for (const suffix of ['/a?spa=1', '/a#spa', '/a']) {
    await content((suffix) => { history.pushState({},'',suffix);return true }, suffix); await wait(1200);
    check((await panelText()).includes('Only page A') === (suffix === '/a'), 'same-document scope ' + suffix);
  }
  await content(() => { const f=document.createElement('iframe');f.src='/frame';document.body.append(f);return true }); await wait(900);
  check((await panelText()).includes('Only page A'), 'child-frame navigation does not replace top-level Changes');
  if (target === 'firefox') {
    await navigate('about:addons'); const text = await panelText();
    check(text.includes('Page unavailable') && !text.includes('Loading page context') && !text.includes('Could not establish connection'), 'native sidebar settles restricted-page state', text);
    await screenshot('firefox-about-addons');
    await navigate(base + '/a'); check((await panelText()).includes('Only page A'), 'native sidebar recovers after restricted page');
  }
  fs.writeFileSync(path.join(out, target + '-results.json'), JSON.stringify({ target, version, checks }, null, 2));
  console.log(JSON.stringify({ target, version, pass: checks.length, checks }, null, 2));
})().catch(error => {
  fs.writeFileSync(path.join(out, target + '-results.json'), JSON.stringify({ target, error: String(error), checks }, null, 2));
  console.error(error); process.exitCode = 1;
}).finally(async () => { if (driver) await driver.quit(); if (context) await context.close(); if (fixture) await new Promise(r => fixture.close(r)); if (profile) fs.rmSync(profile, { recursive: true, force: true }); });
