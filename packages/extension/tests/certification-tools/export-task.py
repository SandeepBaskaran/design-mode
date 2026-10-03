"""Export only task changes relative to the verified uncommitted seed."""
import difflib
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[4]
ORIGIN = ROOT.parent.parent
OUT = ROOT / 'certification-stage1-delivery'
OUT.mkdir(exist_ok=True)
seed = json.loads((ROOT / 'certification-seed.json').read_text())
paths = [
    'packages/extension/src/content/index.ts',
    'packages/extension/src/content/inspector.ts',
    'packages/extension/src/sidepanel/sidepanel.ts',
    'packages/extension/tests/certification/current-run.py',
    'packages/extension/tests/certification/current-matrix.py',
    'packages/extension/tests/certification/panel-actions.cjs',
    'packages/extension/tests/reliability-browser.mjs',
]
for folder in ['certification-breadth', 'certification-regions', 'certification-probes', 'certification-tools']:
    paths += [str(p.relative_to(ROOT)) for p in (ROOT / 'packages/extension/tests' / folder).iterdir()
              if p.is_file() and p.suffix in ['.cjs', '.py', '.html', '.md']]
patches = []
manifest = []
check = OUT / 'patch-check'
if check.exists():
    shutil.rmtree(check)
for name in sorted(set(paths)):
    current = ROOT / name
    if name in seed:
        original = ORIGIN / name
        assert hashlib.sha256(original.read_bytes()).hexdigest() == seed[name], 'Origin changed since seed: ' + name
        before = original.read_text()
        target = check / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(original, target)
    else:
        before = ''
    after = current.read_text()
    if before == after:
        continue
    if name not in seed and current.stat().st_mode & 0o111:
        patches.append('diff --git a/' + name + ' b/' + name + '\nnew file mode 100755\n')
    for line in difflib.unified_diff(before.splitlines(True), after.splitlines(True),
                                    fromfile='a/' + name if name in seed else '/dev/null', tofile='b/' + name):
        patches.append(line if line.endswith('\n') else line + '\n\\ No newline at end of file\n')
    manifest.append({'path': name, 'seed_sha256': seed.get(name), 'sha256': hashlib.sha256(current.read_bytes()).hexdigest(), 'executable': bool(current.stat().st_mode & 0o111)})
patch_path = OUT / 'task-only.patch'
patch_path.write_text(''.join(patches))
(OUT / 'task-manifest.json').write_text(json.dumps(manifest, indent=2))
shutil.copy2(ROOT / 'certification-seed.json', OUT / 'seed-manifest.json')
result = subprocess.run(['git', 'apply', '--check', '--directory=certification-stage1-delivery/patch-check', str(patch_path)], cwd=ROOT, capture_output=True, text=True)
(OUT / 'patch-check.log').write_text(result.stdout + result.stderr)
print(json.dumps({'files': len(manifest), 'patch': str(patch_path), 'apply_check_exit': result.returncode}, indent=2))
raise SystemExit(result.returncode)
