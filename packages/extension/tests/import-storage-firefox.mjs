import { buildSync } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const firefox = process.env.FIREFOX_BIN || '/Applications/Firefox.app/Contents/MacOS/firefox';
assert.ok(existsSync(firefox), 'Firefox is required for this installed-extension probe');
const fixture = mkdtempSync(resolve(pkg, '.import-firefox-'));
let runner;
const server = createServer();
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Firefox storage probe timed out')), 30000);
    server.on('request', (req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => { res.end('ok'); clearTimeout(timer); resolve(JSON.parse(body)); });
    });
  });
  writeFileSync(resolve(fixture, 'manifest.json'), JSON.stringify({manifest_version:2,name:'Import storage contract probe',version:'1.0',permissions:['storage',`http://127.0.0.1/*`],background:{scripts:['probe.js']},browser_specific_settings:{gecko:{id:'import-probe@example.test'}}}));
  buildSync({ stdin: { resolveDir:pkg, loader:'ts', contents:`
    import { persistImportedSession, loadSession, persistSession } from './src/content/change-tracker';
    (async () => {
      try {
        const payload = {styleChanges:[],textChanges:[],domChanges:[]};
        await persistImportedSession(payload);
        if (JSON.stringify(await loadSession()) !== JSON.stringify(payload)) throw Error('session round trip');
        await browser.storage.local.set({probe:payload});
        if (!(await browser.storage.local.get('probe')).probe) throw Error('local round trip');
        persistSession();
        await new Promise(r=>setTimeout(r,200));
        if (!await loadSession()) throw Error('debounced round trip');
        await fetch('http://127.0.0.1:${port}', {method:'POST',body:JSON.stringify({ok:true,session:!!browser.storage.session,checks:3})});
      } catch(e) { await fetch('http://127.0.0.1:${port}', {method:'POST',body:JSON.stringify({ok:false,error:String(e)})}); }
    })();
  `}, bundle:true, outfile:resolve(fixture,'probe.js'), tsconfig:resolve(pkg,'tsconfig.json') });
  const cli = resolve(dirname(createRequire(import.meta.url).resolve('web-ext')), 'bin/web-ext.js');
  runner = spawn(process.execPath, [cli, 'run', '--source-dir', fixture, '--firefox', firefox, '--firefox-profile', resolve(fixture, 'profile'), '--profile-create-if-missing', '--keep-profile-changes', '--ignore-files=profile/**', '--no-reload', '--arg=-headless', '--verbose'], {stdio:['ignore','pipe','pipe'], env:{...process.env,TMPDIR:fixture}});
  runner.stdout.on('data', data => process.stdout.write(data));
  runner.stderr.on('data', data => process.stderr.write(data));
  const received = await result;
  assert.equal(received.ok, true, JSON.stringify(received));
  console.log('PASS installed Firefox native storage: ' + JSON.stringify(received));
} finally {
  if (runner && runner.exitCode === null) {
    runner.kill('SIGINT');
    await new Promise(resolve => runner.once('exit', resolve));
  }
  server.close();
  rmSync(fixture, {recursive:true,force:true,maxRetries:10,retryDelay:100});
}
