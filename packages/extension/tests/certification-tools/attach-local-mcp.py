"""Attach local-MCP evidence with explicit compound-row limitations."""
import hashlib
import json
from pathlib import Path
import re
import shutil


ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT / 'packages/extension/tests/certification/current-evidence'
SOURCE = ROOT / '.correction-evidence/mcp'
DEST = OUT / 'chrome/local-mcp'
execution_path = SOURCE / 'execution.json'
if not execution_path.is_file():
    raise RuntimeError('Historical MCP evidence lacks execution-time provenance; rerun with a fingerprinted runner before attachment.')
execution = json.loads(execution_path.read_text())
hashes = execution['source_sha256_before']
if not hashes or hashes != execution['source_sha256_after'] or execution['exit_code'] != 0:
    raise RuntimeError('MCP execution failed or source changed during the run.')
required = set()
for folder in ['packages/extension/src', 'packages/extension/dist', 'packages/shared/src', 'packages/mcp-local/src', 'packages/mcp-local/dist', 'packages/cli/src', 'packages/cli/dist', 'packages/extension/tests/certification']:
    required.update(str(file.relative_to(ROOT)) for file in (ROOT / folder).rglob('*') if file.is_file() and 'current-evidence' not in file.parts)
required.add('packages/extension/tests/acceptance-installed.cjs')
if not required <= hashes.keys():
    raise RuntimeError('MCP execution fingerprint does not cover the required sources and harness.')
for name, digest in hashes.items():
    file = (ROOT / name).resolve()
    if not file.is_relative_to(ROOT) or not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() != digest:
        raise RuntimeError('MCP execution source no longer matches: ' + name)
if hashlib.sha256((SOURCE / 'mcp-results.json').read_bytes()).hexdigest() != execution['results_sha256']:
    raise RuntimeError('MCP results differ from the recorded execution.')
raw = json.loads((SOURCE / 'mcp-results.json').read_text())
assert raw['results'] and all(r['status'] == 'pass' for r in raw['results'])
by_id = {r['id']: r for r in raw['results']}
evidence = lambda identifier: by_id[identifier]['evidence']
full = set()
assert set(['pageUrl','pageTitle','styleChanges','textChanges','domChanges','cssBlock','comments']) <= evidence('11.4').keys()
assert all(isinstance(evidence('11.4')[key], list) for key in ['styleChanges','textChanges','domChanges','comments'])
full.add('11.4')
first = evidence('11.5a')
later = evidence('11.2b')['items']
assert first and all(row['id'] and row['status'] == 'todo' for row in first)
assert {row['id'] for row in first} <= {row['id'] for row in later}
full.add('11.5a')
summary = evidence('11.7')
assert summary['extensionConnected'] and summary['activeSessions'] >= 1 and summary['sessions']
assert all(isinstance(summary[key], int) for key in ['totalStyleChanges','totalTextChanges','totalComments'])
full.add('11.7')
formats = evidence('11.8')
assert all('font-size: 42px' in formats[k] and 'color: rgb(255, 0, 0)' in formats[k] for k in ['css','scss'])
assert '[font-size:42px]' in formats['tailwind'] and '[color:rgb(255,_0,_0)]' in formats['tailwind']
assert "fontSize: '42px'" in formats['jsx'] and "color: 'rgb(255, 0, 0)'" in formats['jsx']
full.add('11.8')
assert evidence('11.9') == 'No changes to export.'
full.add('11.9')
assert evidence('11.14')['isError'] and 'No comment found with id nonexistent-certification' in json.dumps(evidence('11.14'))
full.add('11.14')
assert 'handoff' not in evidence('11.6')['cleared']
full.add('10.14')
assert 'now owns' in evidence('11.2c')['log'] and evidence('11.2c')['summary']['extensionConnected']
assert str(evidence('11.1')['port']) in evidence('11.2c')['log']
full.add('11.2c')
assert evidence('11.2d')['ended']['code'] == 0 and evidence('11.2d')['portReleased']
full.add('11.2d')
assert evidence('11.2e')['ended']['code'] == 0 and evidence('11.2e')['summary']['extensionConnected']
full.add('11.2e')
limitations = {
 '11.1':'Nine tools/banner and configured local bridge executed; catalogue still specifies eight tools and npm-start path.',
 '11.2a':'Second client attaches and proxies state; ownership PID/WebSocket listener identity not independently asserted.',
 '11.2b':'Third client retains owner state after second closes; listener identity and extension status not independently asserted at this step.',
 '11.3':'Live extension connection asserted; green indicator paint not asserted.',
 '11.5':'Agent apply updates page computed color and ledger; rendered Changes row not asserted.',
 '11.5b':'Status transitions asserted in MCP data; dimming, badge paint, status sub-filter and comment-ID resolution not all exercised.',
 '11.6':'Empty ledger asserted; rendered Changes-tab empty state not asserted in this MCP flow.',
 '11.10':'Valid PNG captured; native viewport extent not certified under Playwright viewport emulation.',
 '11.11':'PNG and ambiguous-selector candidate error captured; exact element crop bounds not independently compared.',
 '11.11b':'Region PNG and off-screen error captured; overlay-free pixel content and physical crop scaling not certified.',
 '11.12':'Element/region IDs and geometry asserted; product returns nearest container selector #empty rather than catalogue literal region.',
 '11.13':'Resolution persisted through MCP without reload; grey/struck pin and rendered row styling not asserted.',
 '10.10':'Handoff requestedAt/pageUrl asserted; Sent toast/button visual state not asserted.',
 '10.18':'Mobile style metadata asserted; text and DOM metadata not exercised.',
 '8.31':'Local token response/guidance asserted; Cloud intentionally not contacted; optional system field not asserted.',
 '18.7':'Distinct manual feedback rounds asserted; complete Waiting/Implementing UI sequence and absence of unsolicited resend not asserted.',
 '18.8':'Stop and reload settle waits; close/disconnect and already-running-command explanatory text not all asserted.',
 '18.9':'Busy ownership and bounded timeout asserted; cancellation and all duplicate-delivery paths not exercised.',
}
known = set(re.findall(r'^\|\s*((?:\d+|F)\.\d+(?:\.\d+)?[a-z]?)(?=\s|\|)', (ROOT / 'docs/e2e-testcases.md').read_text(), re.M))
rows=[]
for row in raw['results']:
    identifier=row['id']
    if identifier not in known:
        continue
    assert identifier in full or identifier in limitations, identifier
    rows.append({'id':identifier,'status':'pass' if identifier in full else 'partial', 'remaining':limitations.get(identifier,''), 'observed':row['evidence'], 'post_assertions':identifier in full})
shutil.copytree(SOURCE, DEST, dirs_exist_ok=True)
(DEST / 'rows.json').write_text(json.dumps({'version':raw['version'],'rows':rows,'supplemental':[row for row in raw['results'] if row['id'] not in known]},indent=2))
(DEST/'source-sha256.json').write_text(json.dumps(hashes,indent=2))
record={'browser':'chrome','suite':'local-mcp','command':execution['command'],'exit_code':execution['exit_code'],'evidence':str(DEST.relative_to(ROOT)),'scope':'Local loopback only; execution-time provenance retained'}
(DEST/'run.json').write_text(json.dumps(record,indent=2))
runs=json.loads((OUT/'runs.json').read_text())
runs=[r for r in runs if (r['browser'],r['suite'])!=('chrome','local-mcp')]+[record]
(OUT/'runs.json').write_text(json.dumps(runs,indent=2))
print(json.dumps({'checks':len(raw['results']),'catalogue_rows':len(rows),'pass':len(full),'partial':len(rows)-len(full)},indent=2))
