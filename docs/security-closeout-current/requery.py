#!/usr/bin/env python3
"""Run unchanged official CodeQL queries against a fresh source database."""
import argparse
import hashlib
import json
import pathlib
import subprocess

p = argparse.ArgumentParser()
p.add_argument('--codeql', required=True, type=pathlib.Path)
p.add_argument('--source', required=True, type=pathlib.Path)
p.add_argument('--output', required=True, type=pathlib.Path)
a = p.parse_args()
q, source, out = a.codeql.resolve(), a.source.resolve(), a.output.resolve()
out.mkdir(parents=True, exist_ok=False)

def run(label, args):
    with (out / (label + '.log')).open('w') as log:
        result = subprocess.run([str(x) for x in args], cwd=source, stdout=log, stderr=subprocess.STDOUT)
    if result.returncode:
        raise SystemExit(f'{label} failed ({result.returncode}); see {out}')

files = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=source).decode().split('\0')
manifest = {name: hashlib.sha256((source / name).read_bytes()).hexdigest() for name in sorted(set(files) - {''}) if (source / name).is_file() and not (source / name).resolve().is_relative_to(out)}
(out / 'source-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
run('version', [q, 'version', '--format=json'])
queries = sorted((q.parent / 'qlpacks/codeql/javascript-queries').glob('*/Security/CWE-079/XssThroughDom.ql'))
if len(queries) != 1:
    raise SystemExit('Expected one official bundled JavaScript query pack')
pack = queries[0].parents[2]
db = out / 'database'
run('create', [q, 'database', 'create', db, '--language=javascript-typescript', f'--source-root={source}', '--threads=4', '--ram=4096'])
summary = {}
for label, query in [('exact-xss', queries[0]), ('security-extended', pack / 'codeql-suites/javascript-security-extended.qls')]:
    sarif = out / (label + '.sarif')
    run(label, [q, 'database', 'analyze', db, query, '--format=sarif-latest', f'--output={sarif}', '--threads=4', '--ram=4096'])
    data = json.loads(sarif.read_text())
    results = [result for entry in data['runs'] for result in entry.get('results', [])]
    invocations = [inv for entry in data['runs'] for inv in entry.get('invocations', [])]
    if not invocations or not all(inv.get('executionSuccessful') for inv in invocations):
        raise SystemExit(f'{label}: missing or failed invocation')
    summary[label] = {'count': len(results), 'results': results, 'executionSuccessful': True}
changed = [name for name, digest in manifest.items() if not (source / name).is_file() or hashlib.sha256((source / name).read_bytes()).hexdigest() != digest]
summary['sourceChangedDuringRun'] = changed
(out / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))
if changed:
    raise SystemExit('Source changed during analysis; rerun required')
