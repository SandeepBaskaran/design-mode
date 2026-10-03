"""Installed Chrome regression runner; disposable profiles and loopback only.
Run after npm run build:extension. DM_EXTENSION_DIST can select a read-only seed
for the red run; DM_FANOUT_OUT selects a fresh evidence directory.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(os.environ.get('DM_FANOUT_OUT', str(ROOT / 'fanout-evidence' / 'verified'))).resolve()
OUT.mkdir(parents=True, exist_ok=False)
DIST = Path(os.environ.get('DM_EXTENSION_DIST', str(ROOT / 'packages/extension/dist'))).resolve()
env = os.environ.copy()
env.setdefault('NODE_PATH', '/Users/sandeepbaskaran/Documents/design-mode-recovery/20260926-212555/browser-test-node_modules')
env.setdefault('CHROME_BINARY', '/Users/sandeepbaskaran/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')
env['DM_EXTENSION_DIST'] = str(DIST)

def fingerprint():
    return {str(p.relative_to(DIST)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(DIST.rglob('*')) if p.is_file()}

before = fingerprint()
(OUT / 'dist-before-sha256.json').write_text(json.dumps(before, indent=2))
runs = []
for name, module, fixture, explicit in [
    ('matching', 'matching-fanout', 'matching-fanout', '0'),
    ('hidden-ui', 'hidden-multiselect', 'hidden-multiselect', '0'),
    ('hidden-batch', 'hidden-batch-multiselect', 'hidden-multiselect', '0'),
    ('hidden-batch-explicit', 'hidden-batch-multiselect', 'hidden-multiselect', '1'),
]:
    runenv = dict(env, DM_ACCEPTANCE_OUT=str(OUT / name),
                  DM_CERTIFICATION_MODULE=str(ROOT / f'packages/extension/tests/certification/{module}.cjs'),
                  DM_CERTIFICATION_FIXTURE=str(ROOT / f'packages/extension/tests/certification/{fixture}-fixture.html'),
                  DM_BATCH_EXPLICIT_HIDDEN=explicit)
    command = ['node', 'packages/extension/tests/acceptance-installed.cjs', 'chrome']
    with (OUT / f'{name}.log').open('w') as log:
        result = subprocess.run(command, cwd=ROOT, env=runenv, stdout=log, stderr=subprocess.STDOUT, timeout=180)
    runs.append({'name': name, 'command': command, 'exit_code': result.returncode})
    print(name, result.returncode, flush=True)
after = fingerprint()
(OUT / 'dist-after-sha256.json').write_text(json.dumps(after, indent=2))
summary = {'dist': str(DIST), 'dist_unchanged': before == after, 'runs': runs,
           'scope': 'Chrome installed unpacked extension; bound panel tab; Playwright input, not native OS shortcut delivery'}
(OUT / 'summary.json').write_text(json.dumps(summary, indent=2))
raise SystemExit(0 if before == after and all(r['exit_code'] == 0 for r in runs) else 1)
