import { buildSync } from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
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
  const sidepanel = readFileSync(resolve(packageRoot, 'src/sidepanel/sidepanel.ts'), 'utf8');
  const start = sidepanel.indexOf("    const linkUrlInput = target.closest<HTMLInputElement>('[data-dm-rich-link-url]');");
  const end = sidepanel.indexOf('    const groupingSelect =', start);
  assert.ok(start >= 0 && end > start, 'actual link change handler must be found');
  const handler = buildSync({
    stdin: {
      contents: `import { sanitizeRichTextHref, RICH_TEXT_LINK_NODE_ATTR } from './src/rich-text-preservation';
        export function install(root, applyAttribute, applyHtml) {
          root.addEventListener('change', (event) => {
            const target = event.target;
            ${sidepanel.slice(start, end)}
          });
        }`,
      resolveDir: packageRoot, loader: 'ts',
    }, bundle: true, write: false, format: 'iife', globalName: 'richHandler',
  });
  writeFileSync(resolve(fixtureDir, 'rich-text.js'), outputFiles[0].text + '\n' + handler.outputFiles[0].text);
  writeFileSync(resolve(fixtureDir, 'test.js'), String.raw`
    const { isSafeRichTextHref, sanitizeRichTextHref, sanitizeRichTextHtml, restoreRichTextHtml } = richText;
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
      for (const raw of ['https://example.test/path?x=1&y=2', '/docs', './docs', '../docs', '#details', '/a b/%2F?q="<tag>', '#café']) {
        const value = sanitizeRichTextHref(raw);
        check(value !== null && isSafeRichTextHref(value), raw);
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
      for (const index of ['0', 'host']) {
        const root = document.createElement('div');
        root.innerHTML = '<input data-dm-rich-link-url="' + index + '"><div data-dm-richtext data-dm-element-id="fixture"><a data-dm-rich-link="0" href="/old">Label</a></div>';
        document.body.append(root);
        const input = root.querySelector('input');
        const link = root.querySelector('a');
        const calls = [];
        richHandler.install(root, (...args) => calls.push(args), (...args) => calls.push(args));
        const change = raw => { input.value = raw; input.dispatchEvent(new Event('change', { bubbles: true })); };
        for (const raw of ['javascript:alert(1)', 'data:text/html,<svg onload=alert(1)>', '//evil.test', '/\\evil.test']) {
          change(raw);
          check(calls.length === 0 && !input.validity.valid && link.getAttribute('href') === '/old', 'rejected handler ' + index + raw);
        }
        for (const raw of ['/a b/%2F?q="<tag>', 'http://[::1]:3000/docs', 'https://[2001:db8::1]/a b', '#café']) {
          change(raw);
          const expected = sanitizeRichTextHref(raw);
          check(input.validity.valid && calls.length > 0, 'accepted handler ' + raw);
          if (index === 'host') check(calls.at(-1)[2] === expected, 'host encoded value');
          else check(link.getAttribute('href') === expected && !link.hasAttribute('onmouseover'), 'nested encoded value');
          if (raw.startsWith('http')) check(new URL(expected).hostname.startsWith('['), 'IPv6 authority remains valid');
        }
        change('  ');
        check(input.validity.valid, 'clearing is valid');
        if (index === 'host') check(calls.at(-1)[2] === '', 'clear host');
        else check(!link.hasAttribute('href'), 'clear nested');
      }
      for (const markup of [
        '<span class="icon"><i class="glyph"></i></span>Label',
        '<svg viewBox="0 0 10 10"><path d="M0 0h10"></path></svg>Label',
        '<span style="background-image:url(data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==)"></span>Label',
        '<strong><span class="icon"></span>Label</strong>',
        '<span class="icon"></span><span class="icon"></span>Label',
      ]) {
        const source = document.createElement('button');
        source.className = 'page-owned';
        source.setAttribute('aria-label', 'Unchanged');
        source.innerHTML = markup;
        document.body.append(source);
        const originals = richText.collectPreservedRichTextNodes(source);
        let events = 0;
        originals.forEach(n => n.addEventListener('identity-probe', () => events++));
        const before = source.innerHTML;
        const after = restoreRichTextHtml(source, sanitizeRichTextHtml(before).replace('Label', 'Replacement'));
        for (const html of [after, before, after]) {
          richText.replaceRichTextHtml(source, html);
          check(source.innerHTML === html, 'exact commit/undo/redo serialization');
          check(source.className === 'page-owned' && source.getAttribute('aria-label') === 'Unchanged', 'parent unchanged');
          const current = richText.collectPreservedRichTextNodes(source);
          originals.forEach((original, i) => {
            check(current[i] === original && original.isConnected, 'live media identity');
            original.dispatchEvent(new Event('identity-probe'));
          });
        }
        check(events === originals.length * 3, 'page listeners retained');
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
