import { buildSync } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = mkdtempSync(resolve(pkg, '.comments-test-'));
try {
  const bundle = buildSync({ stdin: { contents: `
    export * from './src/content/comments';
    export { getOrAssignId, elementMap } from './src/content/helpers';
  `, resolveDir: pkg, loader: 'ts' }, bundle: true, write: false, format: 'iife', globalName: 'Probe', tsconfig: resolve(pkg, 'tsconfig.json') });
  writeFileSync(resolve(fixture, 'bundle.js'), bundle.outputFiles[0].text);
  writeFileSync(resolve(fixture, 'test.js'), String.raw`
(async () => {
  let checks = 0;
  const check = (value, label) => { checks++; if (!value) throw Error(label); };
  const count = () => document.querySelectorAll('.dm-comment-pin').length;
  const saved = (elementId, selector, id = 'comment') => ({id,elementId,selector,text:id,timestamp:1,updatedAt:1,pageUrl:location.href});
  const seed = comments => sessionStorage.setItem('comments', JSON.stringify(comments));
  async function restore(html, comments) {
    Probe.hideAllPins();
    document.body.innerHTML = html;
    seed(comments);
    await Probe.restoreCommentPins();
  }
  try {
    if (!sessionStorage.getItem('reloaded')) {
      document.querySelector('#target').setAttribute('data-dm-id', 'dm-75');
      await Probe.addComment(Probe.getOrAssignId(document.querySelector('#target')), '#target', 'saved before reload');
      await Probe.addRegionComment({x:40,y:60,w:100,h:80}, '#missing-context', 'region before reload');
      sessionStorage.setItem('reloaded', 'yes');
      location.reload();
      return;
    }
    check(!document.querySelector('#target').hasAttribute('data-dm-id'), 'reload starts without an incidental replay stamp');
    await Probe.restoreCommentPins();
    check(count() === 2, 'comment-only reload restores element and region pins');
    check(document.querySelector('#target').getAttribute('data-dm-id') === 'dm-75', 'unique saved selector restores identity');
    check(document.querySelectorAll('.dm-comment-region').length === 1, 'region restores without a matching selector');
    check(Probe.getOrAssignId(document.querySelector('#other')) !== 'dm-75', 'restored ID reserved');
    check(Number(Probe.getOrAssignId(document.createElement('div')).slice(3)) > 75, 'counter advanced beyond saved ID');
    await Probe.restoreCommentPins();
    check(count() === 2, 'repeat restore is idempotent');

    for (const selector of ['#missing', '[', '.ambiguous']) {
      await restore('<div class="ambiguous"></div><div class="ambiguous"></div>', [saved('dm-90',selector)]);
      check(count() === 0, 'stale, malformed or ambiguous selector has no pin: '+selector);
      check(!document.querySelector('[data-dm-id]'), 'unresolved selector does not stamp: '+selector);
    }
    check(Number(Probe.getOrAssignId(document.createElement('div')).slice(3)) > 90, 'unresolved saved IDs reserved too');
    await restore('<div id="target"></div><div id="wrong" data-dm-id="dm-100"></div>', [saved('dm-100','#target')]);
    check(count() === 0, 'reused ID never anchors comment to wrong element');
    check(!document.querySelector('#target').hasAttribute('data-dm-id'), 'competing ID not duplicated');
    await restore('<div id="target" data-dm-id="dm-101"></div>', [saved('dm-100','#target')]);
    check(count() === 0, 'another target identity remains unresolved');
    check(document.querySelector('#target').getAttribute('data-dm-id') === 'dm-101', 'existing identity not overwritten');
    await restore('<div id="target" data-dm-id="dm-100"></div><div data-dm-id="dm-100"></div>', [saved('dm-100','#target')]);
    check(count() === 0, 'duplicate DOM IDs are ambiguous');
    await restore('<div id="target" data-dm-id="dm-100"></div>', [saved('dm-100','#target')]);
    check(count() === 1, 'matching unique existing stamp is accepted');
    document.querySelector('#target').remove();
    Probe.showCommentPin(saved('dm-100','#target'));
    check(count() === 0, 'stale anchor removes its old visible pin');
    await restore('<div id="target"></div>', [saved('dm-110','#target'), saved('dm-110','#target','second')]);
    check(count() === 2, 'multiple comments share one valid anchor');
    await restore('<div id="target"></div><div id="other"></div>', [saved('dm-111','#target'), saved('dm-111','#other','second')]);
    check(count() === 0, 'conflicting saved anchors for one ID remain unresolved');
    check(!document.querySelector('[data-dm-id]'), 'conflicting saved anchors never partially stamp');
    await restore('<div id="target"></div>', []);
    Probe.renderPageComments([saved('dm-120','#target')]);
    check(count() === 1, 'import rendering uses the same safe resolver');
    check(Number(Probe.getOrAssignId(document.createElement('div')).slice(3)) > 120, 'imported comment IDs reserved');
    Probe.renderPageComments([saved('dm-120','#missing')]);
    check(count() === 0, 'import does not trust a stamp with a stale selector');
    await restore('<div id="target"></div><div id="other"></div>', [saved('dm-130','#target')]);
    const cached = document.querySelector('#other');
    Probe.elementMap.set('dm-130', cached);
    Probe.showCommentPin(saved('dm-130','#target'));
    check(count() === 1 && Probe.elementMap.get('dm-130') === document.querySelector('#target'), 'stale cache cannot redirect anchor');
    await restore('<div id="target"></div>', [saved('dm-140','#target')]);
    document.querySelector('#target').outerHTML = '<div id="target"></div>';
    Probe.showCommentPin(saved('dm-140','#target'));
    check(count() === 1 && document.querySelector('#target').getAttribute('data-dm-id') === 'dm-140', 'unique replacement rebinds safely');
    document.body.insertAdjacentHTML('beforeend','<pre id="result">PASS: '+checks+' comment anchor browser checks</pre>');
  } catch (error) {
    document.body.insertAdjacentHTML('beforeend','<pre id="result"></pre>');
    document.querySelector('#result').textContent = 'FAIL: '+error.stack;
  }
})();
`);
  writeFileSync(resolve(fixture, 'index.html'), `<!doctype html><body><div id="target" style="width:100px;height:50px">Target</div><div id="other">Other</div><script>
    window.browser={runtime:{sendMessage:async msg=>{
      const comments=JSON.parse(sessionStorage.getItem('comments')||'[]');
      if(msg.operation.kind==='add'){comments.push(msg.operation.comment);sessionStorage.setItem('comments',JSON.stringify(comments));}
      return {ok:true,comments};
    }}};
  </script><script src="bundle.js"></script><script src="test.js"></script>`);
  const run = spawnSync(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless', '--disable-gpu', '--no-first-run', '--disable-background-networking',
    `--user-data-dir=${resolve(fixture, 'profile')}`, '--dump-dom', '--virtual-time-budget=2000',
    pathToFileURL(resolve(fixture, 'index.html')).href,
  ], { encoding: 'utf8', timeout: 30000, maxBuffer: 3 * 1024 * 1024 });
  assert.equal(run.status, 0, run.error?.message || run.stderr);
  assert.match(run.stdout, /id="result">PASS:/, run.stdout);
  console.log(run.stdout.match(/PASS: [^<]+/)[0] + ' (real reload/native DOM, mocked comment transport; not installed-extension certification)');
} finally { rmSync(fixture, { recursive: true, force: true }); }
