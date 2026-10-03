"""Run installed-browser suites and retain current-build evidence separately."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
OUT = HERE / 'current-evidence'
OUT.mkdir(exist_ok=True)
SUITES = [('chrome', 'baseline', None, None), ('firefox', 'baseline', None, None),
          ('chrome', 'corrections', 'chrome-corrections.cjs', 'chrome-fixture.html'),
          ('firefox', 'corrections', 'firefox-corrections.cjs', 'firefox-fixture.html'),
          ('chrome', 'selection', 'selection-corrections.cjs', 'selection-fixture.html'),
          ('chrome', 'panel', 'panel-corrections.cjs', 'panel-corrections-fixture.html'),
          ('chrome', 'ui-gaps', 'ui-gaps.cjs', 'ui-gaps-fixture.html'),
          ('firefox', 'ui-gaps', 'ui-gaps.cjs', 'ui-gaps-fixture.html'),
          ('chrome', 'ordinary', 'ordinary-current.cjs', 'ui-gaps-fixture.html'),
          ('firefox', 'ordinary', 'ordinary-current.cjs', 'ui-gaps-fixture.html'),
          ('chrome', 'controls', 'controls-current.cjs', 'controls-fixture.html'),
          ('firefox', 'controls', 'controls-current.cjs', 'controls-fixture.html'),
          ('firefox', 'selection-panel', 'firefox-selection-panel.cjs', 'panel-corrections-fixture.html'),
          ('chrome', 'design-breadth', '../certification-breadth/design-controls.cjs', '../certification-breadth/design-fixture.html'),
          ('firefox', 'design-breadth', '../certification-breadth/design-controls.cjs', '../certification-breadth/design-fixture.html'),
          ('chrome', 'changes-breadth', '../certification-breadth/changes.cjs', '../certification-breadth/change-fixture.html'),
          ('firefox', 'changes-breadth', '../certification-breadth/changes.cjs', '../certification-breadth/change-fixture.html'),
          ('chrome', 'regions', '../certification-regions/regions.cjs', '../certification-regions/fixture.html'),
          ('firefox', 'regions', '../certification-regions/regions.cjs', '../certification-regions/fixture.html'),
          ('chrome', 'review-regressions', '../certification-probes/restore.cjs', '../certification-probes/review-fixture.html')]

def fingerprint():
    paths = [ROOT / 'docs/e2e-testcases.md', ROOT / 'packages/extension/tests/acceptance-installed.cjs']
    paths += [p for p in HERE.iterdir() if p.suffix in ['.cjs','.py','.html']]
    paths += [p for p in (HERE.parent / 'certification-probes').iterdir() if p.suffix in ['.cjs','.html']]
    for folder in ['packages/extension/src', 'packages/extension/public', 'packages/shared/src', 'packages/extension/dist', 'packages/extension/tests/certification-breadth', 'packages/extension/tests/certification-regions']:
        paths += [p for p in (ROOT / folder).rglob('*') if p.is_file()]
    return {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths)}


def run(item):
    browser, name, module, fixture = item
    dest = OUT / browser / name
    dist = ROOT / 'packages/extension/dist'
    if dist.is_symlink() or not dist.resolve().is_relative_to(ROOT):
        raise RuntimeError('Refusing an extension build outside this worktree; detach dist symlink and rebuild locally')
    dest.mkdir(parents=True, exist_ok=True)
    before = fingerprint()
    (dest / 'source-sha256.json').write_text(json.dumps(before, indent=2))
    stale = dest / (browser + '-results.json')
    if module and stale.exists():
        stale.unlink()
    env = {k: v for k, v in os.environ.items() if not k.startswith('DM_')}
    env.update(DM_EXTENSION_DIST=str(ROOT / 'packages/extension/dist'), DM_ACCEPTANCE_OUT=str(dest))
    if module:
        env.update(DM_CERTIFICATION_MODULE=str(HERE / module), DM_CERTIFICATION_FIXTURE=str(HERE / fixture))
    command = ['node', 'packages/extension/tests/acceptance-installed.cjs', browser]
    start = time.time()
    try:
        with (dest / 'command.log').open('w') as log:
            result = subprocess.run(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=540)
        code = result.returncode
    except subprocess.TimeoutExpired:
        code = 'timeout'
    if before != fingerprint():
        code = 'source-changed'
    record = dict(browser=browser, suite=name, command=command, module=module, fixture=fixture,
                  exit_code=code, elapsed_seconds=round(time.time()-start, 2), evidence=str(dest.relative_to(ROOT)))
    (dest / 'run.json').write_text(json.dumps(record, indent=2))
    print(json.dumps(record), flush=True)
    return record

if __name__ == '__main__':
    # Never let copied or aborted-run evidence certify the current build.
    import shutil
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    before = fingerprint()
    (OUT / 'source-sha256.json').write_text(json.dumps(before, indent=2))
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        results = list(pool.map(run, SUITES))
    assert before == fingerprint(), 'Source or dist changed during execution'
    (OUT / 'runs.json').write_text(json.dumps(results, indent=2))
    print('Source/dist stable; all suites attempted:', len(results))
    raise SystemExit(1 if any(r['exit_code'] != 0 for r in results) else 0)
