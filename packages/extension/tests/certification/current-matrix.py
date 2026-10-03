"""Join only this run's evidence to every exact catalogue identifier."""
import collections
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
OUT = HERE / 'current-evidence'
text = (ROOT / 'docs/e2e-testcases.md').read_text()
catalogue = []
for line_no, line in enumerate(text.splitlines(), 1):
    if not line.startswith('|'):
        continue
    cells = re.split(r'(?<!\\)\|', line)[1:-1]
    cells = [c.strip() for c in cells]
    if not cells:
        continue
    match = re.match(r'^((?:\d+|F)\.\d+(?:\.\d+)?[a-z]?)(?:\s+(.*))?$', cells[0])
    if not match:
        continue
    if len(cells) == 4:
        title, action, expected = cells[1:]
    elif len(cells) == 3 and match[2]:
        title, action, expected = match[2], cells[1], cells[2]
    else:
        raise ValueError((line_no, cells))
    catalogue.append(dict(id=match[1], title=title, action=action, expected=expected, line=line_no))
assert len({r['id'] for r in catalogue}) == len(catalogue), 'Duplicate catalogue IDs'
assert len(catalogue) == 429, 'The exact 429-ID acceptance catalogue changed unexpectedly'
known = {r['id'] for r in catalogue}
evidence = collections.defaultdict(list)

# These assertions intentionally cover only part of their compound catalogue row.
partial = {
 '3.2':'Padding-top and tracking verified; expanded side-input and computed-box inputs share a property selector, so the exact computed-box hit target is not established.',
 '8.24':'Scoped edit/reset and an unthemed outside element verified; a separately themed sibling scope was not exercised.',
 '0.5.3':'Colour families sampled; preserving existing stored-rule formats not asserted.',
 '0.5.8':'Reset preferences subset asserted; all launch/cursor/MCP defaults not asserted.',
 '3.4':'Link behaviour and undo/redo asserted; blue icon colour not asserted.',
 '3.5':'Unlink behaviour asserted; grey-outline icon colour not asserted.',
 '6.1':'Comment and pin existence asserted; yellow pin paint not asserted.',
 '7.11':'Comment row asserted; yellow paint and selector not both asserted.',
 '7.24':'Icon appearance checked on unique heading rather than recurring-class selector.',
 '0.10.14b':'Group undo/redo verified; each-deletion wording differs from grouped implementation.',
}
for browser in ['chrome','firefox']:
    for file in (OUT / browser).rglob('rows.json'):
        data = json.loads(file.read_text())
        rows = data if isinstance(data, list) else data.get('rows', data.get('results', []))
        for index, row in enumerate(rows):
            identifier = row.get('id')
            if identifier not in known:
                continue
            status = row.get('status', 'not-run')
            reason = row.get('remaining') or row.get('limitations') or row.get('limitation')
            if status == 'pass' and identifier in partial and not (identifier == '6.1' and file.parent.name == 'changes-breadth'):
                status, reason = 'partial', partial[identifier]
            evidence[browser, identifier].append(dict(status=status, remaining=reason,
                file=str(file.relative_to(ROOT)), index=index, raw=row))
    baseline = OUT / browser / 'baseline' / (browser+'-results.json')
    if baseline.exists():
        data=json.loads(baseline.read_text())
        for identifier, indices, remaining in [
            ('0.7',[0,1,2],None),
            ('0.8',list(range(5,13)),'Navigation/SPA/comment isolation tested; arbitrary style and DOM isolation not all asserted.'),
            ('13.2',[2],'Reload tested; style-edit away/back revisit not executed.'),
        ]:
            checks=data.get('checks',[])
            selected=[checks[i] for i in indices if i<len(checks)]
            if len(selected) == len(indices) and all(r['ok'] for r in selected):
                evidence[browser,identifier].append(dict(status='partial' if remaining else 'pass',remaining=remaining,file=str(baseline.relative_to(ROOT)),raw=selected))
        if browser=='firefox':
            evidence[browser,'0.12'].append(dict(status='partial',remaining='Native about:addons disabled state and recovery tested; console-spam absence not asserted.',file=str(baseline.relative_to(ROOT)),raw=data.get('checks',[])[-2:]))
    corrections=OUT/browser/'corrections'/('regressions.json' if browser=='chrome' else 'corrections.json')
    if corrections.exists():
        data=json.loads(corrections.read_text())
        records=data if isinstance(data,list) else data.get('results',data.get('checks',[]))
        for index,row in enumerate(records):
            identifier = row.get('id')
            if browser=='chrome':
                identifier=['1.2','0.5.8','0.10.25'][index] if index<3 else None
            elif identifier in ['4.6-data','4.6-http']:
                identifier='4.6'
            if identifier not in known:continue
            ok=row.get('pass',row.get('status')=='pass')
            reason=partial.get(identifier)
            if identifier=='1.2':reason='Outline geometry checked; configurable colour and dimension-label requirement not both asserted.'
            evidence[browser,identifier].append(dict(status=('partial' if reason else 'pass') if ok else 'fail',remaining=reason,file=str(corrections.relative_to(ROOT)),index=index,raw=row))

matrix=[]
checks_file=OUT/'checks.json'
if checks_file.exists():
    for check in json.loads(checks_file.read_text()):
        if check['command']==['npm','run','lint:extension']:
            evidence['firefox','F.13'].append(dict(status='pass' if check['exit_code']==0 else 'fail',file=str(checks_file.relative_to(ROOT)),raw=check))
for browser in ['chrome','firefox']:
    for item in catalogue:
        entries=evidence[browser,item['id']]
        states={e['status'] for e in entries}
        status='fail' if 'fail' in states else 'pass' if 'pass' in states else 'partial' if 'partial' in states else 'not-run'
        if browser=='chrome' and item['id'].startswith('F.'):
            status='not-applicable'
        if browser=='firefox' and (item['id'].startswith('15.') or item['id']=='2.15'):
            status='not-applicable'
        matrix.append(dict(browser=browser,**item,status=status,evidence=entries,
            remaining=None if status in ['pass','not-applicable'] else 'See exact expected/action and evidence limitations; not automatically a human-only task.'))
counts={b:dict(collections.Counter(r['status'] for r in matrix if r['browser']==b)) for b in ['chrome','firefox']}
runs = json.loads((OUT / 'runs.json').read_text())
supplemental = []
for file in OUT.glob('*/*/rows.json'):
    data = json.loads(file.read_text())
    if isinstance(data, dict):
        supplemental.extend(dict(browser=file.parent.parent.name, suite=file.parent.name, **r)
                            for r in data.get('supplemental', []))
summary=dict(aggregation_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    suite_runs=runs, suite_failures=[r for r in runs if r['exit_code'] != 0],
    supplemental=supplemental, catalogue_sha256=hashlib.sha256(text.encode()).hexdigest(),catalogue_rows=len(catalogue),browser_rows=len(matrix),counts=counts,
    exhaustive=False,historic_evidence_used=False,chrome_surface='Google Chrome for Testing 151 installed extension in a bound panel tab, not branded Chrome 153 native side panel',
    firefox_surface='Native Firefox temporary installed extension and native sidebar')
(OUT/'matrix.json').write_text(json.dumps(dict(summary=summary,rows=matrix),indent=2))
(OUT/'remaining-automation.json').write_text(json.dumps([r for r in matrix if r['status'] in ['not-run','partial','fail']],indent=2))
(OUT/'summary.json').write_text(json.dumps(summary,indent=2))
print(json.dumps(summary,indent=2))
raise SystemExit(1 if summary['suite_failures'] or any(r['status'] == 'fail' for r in matrix + supplemental) else 0)
