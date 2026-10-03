import { buildSync } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = mkdtempSync(resolve(pkg, '.analytics-browser-'));
try {
  for (const mode of ['unconfigured', 'chrome', 'firefox-native', 'firefox-fallback', 'firefox-denied']) {
    buildSync({ entryPoints: [resolve(pkg, 'src/sidepanel/analytics-setting.ts')], bundle: true, outfile: resolve(fixture, 'bundle.js'), format: 'iife', globalName: 'AnalyticsSetting', define: {
      __DM_ANALYTICS__: JSON.stringify(mode === 'unconfigured' ? null : { host: 'https://analytics.invalid', key: 'phc_local_test_only' }),
    } });
    writeFileSync(resolve(fixture, 'index.html'), `<!doctype html><html><body><main id="settings"></main><pre id="result"></pre><script>
      window.fetch=()=>{throw Error('No network permitted')};
      let stored={}, granted=false, requests=0, stops=0;
      const listeners={addListener(){}};
      window.browser={${mode.startsWith('firefox') ? 'sidebarAction:{},' : ''}
        storage:{local:{get:async()=>stored,set:async value=>Object.assign(stored,value),remove:async key=>{delete stored[key]}},onChanged:listeners},
        runtime:{sendMessage:async()=>{stops++;return {ok:true}}},
        permissions:{getAll:async()=>(${mode === 'firefox-native' || mode === 'firefox-denied' ? "{data_collection:granted?['technicalAndInteraction', 'locationInfo']:[]}" : '{}'}),request:()=>{requests++;granted=${mode !== 'firefox-denied'};return Promise.resolve(granted)},onRemoved:listeners,onAdded:listeners}
      };
    </script><script src="bundle.js"></script><script>
    (async()=>{try {
      const check=(v,label)=>{if(!v)throw Error(label)};
      const mount=()=>{document.querySelector('#settings').innerHTML=AnalyticsSetting.renderAnalyticsSetting();document.querySelector('button').onclick=()=>AnalyticsSetting.toggleAnalytics()};
      AnalyticsSetting.initAnalyticsSetting(mount);
      await AnalyticsSetting.refreshAnalyticsSetting();mount();
      check(document.querySelector('button').getAttribute('aria-checked')==='false','initial off');
      check(document.querySelector('button').getAttribute('aria-describedby')==='dm-analytics-disclosure','disclosure association');
      check(document.querySelector('#dm-analytics-disclosure').textContent.includes('IP address'),'IP disclosure');
      const done=new Promise(resolve=>{const b=document.querySelector('button');b.onclick=async()=>{await AnalyticsSetting.toggleAnalytics();resolve()}});
      if('${mode}'==='unconfigured'){check(document.querySelector('button').disabled,'disabled unconfigured');}
      else {
        document.querySelector('button').click();await done;
        if('${mode}'==='firefox-denied'){check(!stored['dm-analytics-consent-v1'],'denial');}
        else {check(stored['dm-analytics-consent-v1'].enabled,'explicit consent');check(document.querySelector('button').getAttribute('aria-checked')==='true','on state');await AnalyticsSetting.disableAnalytics();check(!stored['dm-analytics-consent-v1']&&stops===1,'opt out');}
      }
      check(requests===('${mode}'==='firefox-native'||'${mode}'==='firefox-denied'?1:0),'native permission request count');
      document.querySelector('#result').textContent='PASS ${mode}: rendered setting, disclosure, consent and no-fetch fixture';
    }catch(e){document.querySelector('#result').textContent='FAIL '+e.stack}})();
    </script></body></html>`);
    const run = spawnSync(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless', '--disable-gpu', '--no-first-run', '--disable-background-networking', `--user-data-dir=${resolve(fixture, 'profile')}`, '--dump-dom', '--virtual-time-budget=2000', pathToFileURL(resolve(fixture, 'index.html')).href], { encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /id="result">PASS /, run.stdout);
    console.log(run.stdout.match(/id="result">(PASS [^<]+)/)[1] + ' (real Chromium DOM; browser APIs mocked)');
  }
} finally { rmSync(fixture, { recursive: true, force: true }); }
