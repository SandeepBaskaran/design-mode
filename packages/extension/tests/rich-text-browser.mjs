import { buildSync } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chrome = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const fixtureDir = mkdtempSync(resolve(packageRoot, '.rich-text-test-'));
try {
  const { outputFiles } = buildSync({
    entryPoints: [resolve(packageRoot, 'src/rich-text-preservation.ts')],
    bundle: true, write: false, format: 'iife', globalName: 'richText',
  });
  writeFileSync(resolve(fixtureDir, 'rich-text.js'), outputFiles[0].text);
  writeFileSync(resolve(fixtureDir, 'test.js'), String.raw`
    const { isSafeRichTextHref, sanitizeRichTextHtml, restoreRichTextHtml } = richText;
    const check = (value, message) => { if (!value) throw Error(message); };
    try {
      const payloads = [
        '<a href="javascript:alert(1)" onclick="alert(1)">bad</a>',
        '<a href="java&#x09;script:alert(1)">bad</a>',
        '<a href="&#106;avascript:alert(1)">bad</a>',
        '<a href="data:text/html,bad">bad</a>',
        '<a href="//example.test">bad</a>',
        '<a href="/\\example.test">bad</a>',
        '<a href="/&#10;/example.test">bad</a>',
        '<svg><a href="javascript:alert(1)">bad</a></svg>',
        '<img src=x onerror="alert(1)"><script>alert(1)</script>',
        '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
      ];
      for (const payload of payloads) {
        const panel = document.createElement('div');
        panel.innerHTML = sanitizeRichTextHtml(payload);
        document.body.append(panel);
        check(!panel.querySelector('script,svg,img,iframe,object,embed'), payload);
        for (const el of panel.querySelectorAll('*')) {
          check(![...el.attributes].some(a => /^on/i.test(a.name)), payload);
        }
        for (const a of panel.querySelectorAll('a')) check(!a.hasAttribute('href'), payload);
      }
      for (const value of ['https://example.test/path?x=1&y=2', '/docs', './docs', '../docs', '#details']) {
        check(isSafeRichTextHref(value), value);
        const panel = document.createElement('div');
        panel.innerHTML = sanitizeRichTextHtml('<a href="/old">Label</a>');
        const link = panel.querySelector('a');
        link.setAttribute('href', value);
        const source = document.createElement('div');
        source.innerHTML = '<a href="/old" class="page-owned">Label</a>';
        const restored = restoreRichTextHtml(source, panel.innerHTML);
        source.innerHTML = restored;
        check(source.querySelector('a').getAttribute('href') === value, 'round trip ' + value);
        check(source.querySelector('a').className === 'page-owned', 'structure retained');
      }
      const anchor = document.createElement('a');
      anchor.setAttribute('href', 'https://example.test/"onmouseover="alert(1)');
      check(!anchor.hasAttribute('onmouseover'), 'setAttribute does not parse HTML');
      document.body.innerHTML = '<pre id="result">PASS: native DOM sanitizer and link round trips</pre>';
    } catch (error) {
      document.body.textContent = 'FAIL: ' + error.stack;
    }
  `);
  writeFileSync(resolve(fixtureDir, 'index.html'), '<!doctype html><body><script src="rich-text.js"></script><script src="test.js"></script>');
  const result = spawnSync(chrome, [
    '--headless', '--disable-gpu', '--no-first-run', '--disable-background-networking',
    `--user-data-dir=${resolve(fixtureDir, 'profile')}`, '--dump-dom',
    pathToFileURL(resolve(fixtureDir, 'index.html')).href,
  ], { encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  assert.match(result.stdout, /id="result">PASS:/, result.stdout);
  console.log('PASS: Chromium native DOM sanitizer vectors and guarded href round trips (not installed-extension certification)');
} finally {
  rmSync(fixtureDir, { recursive: true, force: true });
}
