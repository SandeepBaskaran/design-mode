"""Resume missing suites only when the saved source fingerprint still matches."""
import argparse
import json
from pathlib import Path
import runpy
import shutil
import time

HERE = Path(__file__).resolve().parent
runner = runpy.run_path(str(HERE.parent / 'certification/current-run.py'))
parser = argparse.ArgumentParser()
parser.add_argument('--retry-failed', action='store_true')
parser.add_argument('--only', action='append', default=[], help='browser/suite')
args = parser.parse_args()
out = runner['OUT']
saved = json.loads((out / 'source-sha256.json').read_text())
if saved != runner['fingerprint']():
    raise SystemExit('Source/dist differs from saved run. Start a fresh current-run.py; refusing stale certification.')
ledger = out / 'runs.json'
records = json.loads(ledger.read_text()) if ledger.exists() else []
by_suite = {(r['browser'], r['suite']): r for r in records}
for result_file in out.glob('*/*/run.json'):
    source_file = result_file.parent / 'source-sha256.json'
    if source_file.exists() and json.loads(source_file.read_text()) == saved:
        row = json.loads(result_file.read_text())
        by_suite[row['browser'], row['suite']] = row
for item in runner['SUITES']:
    key = item[:2]
    name = '/'.join(key)
    if args.only and name not in args.only:
        continue
    previous = by_suite.get(key)
    if previous and (previous['exit_code'] == 0 or not args.retry_failed):
        continue
    if previous:
        archive = out.parent / 'retry-history' / str(time.time_ns()) / name
        archive.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(out / name, archive)
    by_suite[key] = runner['run'](item)
    ledger.write_text(json.dumps(list(by_suite.values()), indent=2))
if saved != runner['fingerprint']():
    raise SystemExit('Source/dist changed during resumed execution')
missing = ['/'.join(item[:2]) for item in runner['SUITES'] if item[:2] not in by_suite]
failed = ['/'.join(key) for key, row in by_suite.items() if row['exit_code'] != 0]
print(json.dumps({'completed': len(by_suite), 'missing': missing, 'failed': failed}, indent=2))
raise SystemExit(1 if missing or failed else 0)
