"""Execute local MCP certification with immutable before/after provenance."""
import datetime
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT / '.correction-evidence/mcp'


def fingerprint():
    files = set()
    for folder in ['packages/extension/src', 'packages/extension/dist', 'packages/shared/src', 'packages/mcp-local/src', 'packages/mcp-local/dist', 'packages/cli/src', 'packages/cli/dist', 'packages/extension/tests/certification']:
        files.update(file for file in (ROOT / folder).rglob('*') if file.is_file() and 'current-evidence' not in file.parts)
    files.add(ROOT / 'packages/extension/tests/acceptance-installed.cjs')
    files.update(ROOT / name for name in ['package.json', 'package-lock.json', 'packages/extension/tests/certification-tools/run-local-mcp.py', 'packages/extension/tests/certification-tools/attach-local-mcp.py'])
    return {str(file.relative_to(ROOT)): hashlib.sha256(file.read_bytes()).hexdigest() for file in sorted(files)}


if __name__ == '__main__':
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    if OUT.exists():
        archive = ROOT / '.correction-evidence' / ('mcp-preserved-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
        shutil.move(str(OUT), str(archive))
    OUT.mkdir(parents=True)
    before = fingerprint()
    command = ['node', 'packages/extension/tests/certification/run.cjs', 'mcp']
    with (OUT / 'execution.log').open('w') as log:
        process = subprocess.run(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
    after = fingerprint()
    results = OUT / 'mcp-results.json'
    record = {
        'command': command, 'exit_code': process.returncode,
        'started_at': started, 'finished_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'source_sha256_before': before, 'source_sha256_after': after,
        'results_sha256': hashlib.sha256(results.read_bytes()).hexdigest() if results.is_file() else None,
        'node_version': subprocess.check_output(['node', '--version'], cwd=ROOT, text=True).strip(),
    }
    (OUT / 'execution.json').write_text(json.dumps(record, indent=2))
    print(json.dumps({'exit_code': process.returncode, 'source_stable': before == after, 'evidence': str(OUT)}))
    if process.returncode or before != after or not results.is_file():
        raise SystemExit(process.returncode or 1)
