import { buildSync } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const firefox = process.env.FIREFOX_BIN || '/Applications/Firefox.app/Contents/MacOS/firefox';
assert.ok(existsSync(firefox), 'Installed Firefox required');
const fixture = mkdtempSync(resolve(pkg, '.analytics-firefox-'));
const server = createServer();
let runner;
let timer;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const result = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(Error('Firefox analytics probe timed out')), 30000);
    server.on('request', (req, res) => {
      let body = ''; req.on('data', chunk => { body += chunk; });
      req.on('end', () => { res.end('ok'); resolve(JSON.parse(body)); });
    });
  });
  writeFileSync(resolve(fixture, 'manifest.json'), JSON.stringify({
    manifest_version: 3, name: 'Local analytics consent probe', version: '1.0',
    permissions: ['storage'], host_permissions: ['http://127.0.0.1/*'],
    background: { scripts: ['probe.js'] },
    browser_specific_settings: { gecko: { id: 'dm-analytics-probe@example.test', strict_min_version: '121.0', data_collection_permissions: { required: ['none'], optional: ['technicalAndInteraction', 'locationInfo'] } } },
  }));
  buildSync({ stdin: { resolveDir: pkg, loader: 'ts', contents: `
    import { createAnalytics, ANALYTICS_CONSENT_KEY, parseAnalyticsConfig } from './src/platform/analytics';
    (async()=>{let calls=0;try {
      const config=parseAnalyticsConfig({host:'https://analytics.invalid',key:'phc_local_test_only'});
      const initial=await browser.permissions.getAll();
      const analytics=createAnalytics(config,{readConsent:async()=>(await browser.storage.local.get(ANALYTICS_CONSENT_KEY))[ANALYTICS_CONSENT_KEY],permissions:()=>browser.permissions.getAll(),firefox:true,manifest:{version:'1.0'},fetch:async()=>{calls++;return new Response('{}')}});
      await analytics.capture({feature:'inspect',outcome:'attempt'});
      if(calls)throw Error('default egress');
      if(!Array.isArray(initial.data_collection))throw Error('installed Firefox lacks native data consent; fallback covered separately');
      await browser.permissions.remove({data_collection:['technicalAndInteraction', 'locationInfo']});
      await browser.storage.local.set({[ANALYTICS_CONSENT_KEY]:{...config,version:2,enabled:true}});
      await analytics.capture({feature:'inspect',outcome:'attempt'});
      if(calls)throw Error('native denial bypass');
      analytics.stop();await browser.storage.local.remove(ANALYTICS_CONSENT_KEY);
      await analytics.capture({feature:'inspect',outcome:'attempt'});
      if(calls)throw Error('optout egress');
      await fetch('http://127.0.0.1:${port}',{method:'POST',body:JSON.stringify({ok:true,checks:3,native:true,analyticsFetchCalls:calls})});
    }catch(e){await fetch('http://127.0.0.1:${port}',{method:'POST',body:JSON.stringify({ok:false,error:String(e)})})}})();
  ` }, bundle: true, outfile: resolve(fixture, 'probe.js') });
  const cli = resolve(dirname(createRequire(import.meta.url).resolve('web-ext')), 'bin/web-ext.js');
  runner = spawn(process.execPath, [cli, 'run', '--source-dir', fixture, '--firefox', firefox, '--firefox-profile', resolve(fixture, 'profile'), '--profile-create-if-missing', '--keep-profile-changes', '--ignore-files=profile/**', '--no-reload', '--arg=-headless'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TMPDIR: fixture } });
  runner.stderr.on('data', data => process.stderr.write(data));
  const received = await result;
  assert.equal(received.ok, true, JSON.stringify(received));
  console.log('PASS installed Firefox MV3/native consent/storage gates: ' + JSON.stringify(received) + ' (analytics fetch mocked; only result report uses loopback HTTP)');
} finally {
  clearTimeout(timer);
  if (runner && runner.exitCode === null) { runner.kill('SIGINT'); await new Promise(resolve => runner.once('exit', resolve)); }
  server.closeAllConnections(); server.close();
  rmSync(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
