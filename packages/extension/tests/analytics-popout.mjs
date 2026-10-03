import { buildSync } from 'esbuild';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chrome = process.env.CHROME_BIN;
assert.ok(chrome && existsSync(chrome), 'Set CHROME_BIN to Chrome for Testing/Chromium supporting --load-extension');
const fixture = mkdtempSync(resolve(pkg, '.analytics-popout-'));
const server = createServer();
let runner, timer;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const result = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(Error('Installed popout probe timed out')), 30000);
    server.on('request', (req, res) => {
      let body = ''; req.on('data', chunk => { body += chunk; });
      req.on('end', () => { res.end('ok'); resolve(JSON.parse(body)); });
    });
  });
  mkdirSync(resolve(fixture, 'sidepanel'));
  writeFileSync(resolve(fixture, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Local analytics sender probe', version: '1.0', permissions: ['storage'], host_permissions: ['http://127.0.0.1/*'], background: { service_worker: 'worker.js' } }));
  writeFileSync(resolve(fixture, 'sidepanel/index.html'), '<!doctype html><script src="panel.js"></script>');
  writeFileSync(resolve(fixture, 'sidepanel/panel.js'), `
    (async()=>{
      const event=await chrome.runtime.sendMessage({type:'DM_ANALYTICS_EVENT',event:{feature:'inspect',outcome:'attempt'}});
      const stop=await chrome.runtime.sendMessage({type:'DM_ANALYTICS_STOP'});
      const after=await chrome.runtime.sendMessage({type:'DM_ANALYTICS_EVENT',event:{feature:'inspect',outcome:'attempt'}});
      await chrome.runtime.sendMessage({type:'REPORT',event,stop,after});
    })();
  `);
  buildSync({ stdin: { resolveDir: pkg, loader: 'ts', contents: `
    import { isAnalyticsSender, createAnalytics } from './src/platform/analytics';
    let calls=0, metadata;
    const config={host:'https://analytics.invalid',key:'phc_local_test_only'};
    const analytics=createAnalytics(config,{readConsent:async()=>({...config,version:2,enabled:true}),permissions:async()=>({}),firefox:false,manifest:{version:'1.0'},fetch:async()=>{calls++;return new Response('{}')}});
    chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
      if(msg.type==='REPORT') {
        fetch('http://127.0.0.1:${port}',{method:'POST',body:JSON.stringify({calls,metadata,...msg})});
        respond({ok:true});return false;
      }
      if(!isAnalyticsSender(sender,chrome.runtime)){respond({ok:false});return false;}
      metadata={id:sender.id,url:sender.url,origin:sender.origin,tab:!!sender.tab};
      if(msg.type==='DM_ANALYTICS_STOP'){analytics.stop();respond({ok:true});return false;}
      analytics.capture(msg.event).then(()=>respond({ok:true})); return true;
    });
    chrome.windows.create({type:'popup',url:chrome.runtime.getURL('sidepanel/index.html?popout=1&tabId=7')});
  ` }, bundle: true, outfile: resolve(fixture, 'worker.js') });
  runner = spawn(chrome, [...(process.env.HEADFUL ? [] : ['--headless=new']), '--no-first-run', '--disable-gpu', '--disable-background-networking', '--disable-component-update', '--no-default-browser-check', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', `--user-data-dir=${resolve(fixture, 'profile')}`, `--disable-extensions-except=${fixture}`, `--load-extension=${fixture}`, 'about:blank'], { stdio: 'ignore' });
  const received = await result;
  assert.equal(received.metadata.tab, true, 'Installed popout sender must contain sender.tab');
  assert.equal(received.event.ok, true);
  assert.equal(received.stop.ok, true);
  assert.equal(received.after.ok, true);
  assert.equal(received.calls, 1, 'STOP suppresses subsequent capture');
  console.log('PASS installed Chromium MV3 popup sender + EVENT/STOP: ' + JSON.stringify(received) + ' (real sender metadata; production guard/transport module; analytics fetch mocked)');
} finally {
  clearTimeout(timer);
  if (runner && runner.exitCode === null) { runner.kill('SIGKILL'); await new Promise(resolve => runner.once('exit', resolve)); }
  server.closeAllConnections(); server.close();
  rmSync(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
