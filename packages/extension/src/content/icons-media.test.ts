import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadFunction(file: string, name: string, globals: Record<string, unknown> = {}) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  const end = source.indexOf('\n}', start) + 2;
  const js = ts.transpileModule(source.slice(start, end) + `\nexports.fn = ${name};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: { fn?: (...args: any[]) => any } = {};
  vm.runInNewContext(js, { exports, URL, ...globals });
  return exports.fn!;
}

const detect = loadFunction('./inspector.ts', 'detectIconInfo');
const element = (tagName: string, classes: string, attrs: Record<string,string> = {}) => ({
  tagName, className: tagName === 'svg' ? {baseVal: classes} : classes,
  classList: classes.split(/\s+/).filter(Boolean), getAttribute: (key: string) => attrs[key] ?? null,
});

test('native SVG animated className does not hide Lucide identity', () => {
  assert.equal(JSON.stringify(detect(element('svg', 'lucide lucide-house'))), JSON.stringify({library:'lucide',name:'house'}));
});

test('Remix font identity excludes sizing/helper classes', () => {
  for (const tag of ['i','span']) {
    assert.equal(JSON.stringify(detect(element(tag, 'ri-lg ri-fw ri-home-line'))), JSON.stringify({library:'remix',name:'home-line'}));
    assert.equal(detect(element(tag, 'ri-lg ri-fw ri-2x')), undefined);
  }
});

test('genuine upstream Heroicons SVG has no DOM library/name metadata', () => {
  const svg = readFileSync(new URL('../../tests/fixtures/heroicons/home.svg', import.meta.url), 'utf8');
  const attrs = Object.fromEntries([...svg.slice(0, svg.indexOf('>')).matchAll(/([\w:-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
  assert.equal(attrs.viewBox, '0 0 24 24');
  assert.equal(detect(element('svg', attrs.class || '', attrs)), undefined);
});

test('generic Heroicons markup and accessibility labels cannot establish identity', () => {
  assert.equal(detect(element('svg','',{'data-slot':'icon','aria-label':'home'})),undefined);
  assert.equal(detect(element('svg','heroicon heroicon-home',{'data-slot':'icon'})),undefined);
});

test('FontAwesome metadata continues to work', () => {
  assert.equal(detect(element('svg','',{'data-icon':'heart'})).name,'heart');
  assert.equal(detect(element('i','fa fa-heart')).library,'fontawesome');
});

test('cross-origin privileged resource timing is not treated as readable metadata', () => {
  let lookups = 0;
  const resolve = loadFunction('./index.ts','resolveResourceBytes',{
    location:{href:'https://fixture.test/page',origin:'https://fixture.test'},
    performance:{getEntriesByName:()=>{lookups++;return [{transferSize:410,encodedBodySize:110,decodedBodySize:110}]}},
  });
  assert.equal(resolve('https://other.test/image.svg'),undefined);
  assert.equal(lookups,0);
  assert.equal(resolve('/image.svg'),410);
  assert.equal(lookups,1);
});

test('same-origin cached bodies, absent entries and zeroed entries keep existing behavior', () => {
  for (const [entries, expected] of [[[],undefined],[[{transferSize:0,encodedBodySize:0,decodedBodySize:0}],undefined],[[{transferSize:0,encodedBodySize:110,decodedBodySize:200}],110]] as const) {
    const resolve=loadFunction('./index.ts','resolveResourceBytes',{
      location:{href:'https://fixture.test/page',origin:'https://fixture.test'},performance:{getEntriesByName:()=>entries},
    });
    assert.equal(resolve('/image.svg'),expected);
  }
});
