import csv, hashlib, json, re, subprocess, os
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
assert Path.cwd()==ROOT, 'Run from assigned worktree root'

def writecsv(name, rows):
    with (OUT/name).open('w', newline='') as f:
        writer=csv.DictWriter(f, fieldnames=list(rows[0]), lineterminator='\n'); writer.writeheader(); writer.writerows(rows)

def cells(line):
    # Literal pipes in Markdown code spans and escaped pipes are not delimiters.
    result=[]; part=''; ticks=False; escaped=False
    for c in line.strip().strip('|'):
        if escaped: part+=c; escaped=False; continue
        if c=='\\': part+=c; escaped=True; continue
        if c=='`': ticks=not ticks
        if c=='|' and not ticks: result.append(part.strip());part=''
        else: part+=c
    result.append(part.strip());return result

manual=[]; section=''
for i,line in enumerate((ROOT/'docs/e2e-testcases.md').read_text().splitlines(),1):
    if line.startswith('#'): section=line.lstrip('# ').strip()
    if not line.startswith('|'):continue
    c=cells(line); m=re.match(r'^((?:\d+|F)(?:\.\d+)+(?:[a-z])?)(?:\s+(.*))?$',c[0])
    if not m:continue
    phase18=m.group(1).startswith('18.')
    manual.append(dict(id=m.group(1),section=section,title=m.group(2) if phase18 else c[1],steps=c[1] if phase18 else c[2],expected=c[2] if phase18 else c[3],source=f'docs/e2e-testcases.md:{i}',status='UNTESTED',evidence='No installed-extension/manual row exercised in this audit',scope='website' if m.group(1).startswith('14.') else 'firefox' if m.group(1).startswith('F.') else 'extension-or-MCP'))
assert len({r['id'] for r in manual})==len(manual),'duplicate test identifiers'
writecsv('manual-inventory.csv',manual)

catalog=[]
for name in ['FEATURES.md','DESIGN-PANEL.md','PARITY.md']:
    lines=(ROOT/name).read_text().splitlines(); headings={}; fenced=False
    for idx,line in enumerate(lines):
        if line.startswith('```'): fenced=not fenced; continue
        if fenced:continue
        kind=None
        h=re.match(r'^(#{2,6})\s+(.+)',line)
        if h:
            level=len(h[1]);headings={k:v for k,v in headings.items() if k<level};headings[level]=h[2];kind='section'
        elif line.startswith('|') and not re.match(r'^\|\s*[-:]+',line):
            if idx+1<len(lines) and re.match(r'^\|\s*[-:]+',lines[idx+1]):continue
            kind='table-claim'
        elif re.match(r'^\s*[-*]\s+',line):kind='bullet-claim'
        if kind:
            section=' / '.join(headings.values())
            context='documented-skip' if 'Skipped' in section or 'out of scope' in section.lower() else 'documented-plan' if 'Planned' in section else 'documented-claim'
            # Keep wrapped continuations verbatim; a row is a traceable source claim, not a deduped feature.
            text=line.strip(); j=idx+1
            if kind=='bullet-claim':
                while j<len(lines) and lines[j].strip() and not re.match(r'^\s*(?:[-*]\s|#|\|)',lines[j]):text+=' '+lines[j].strip();j+=1
            catalog.append(dict(id=f'{name}:{idx+1}',source=name,line=idx+1,kind=kind,section=section,claim=text,catalog_state=context,runtime_status='UNTESTED',note='Documentation inventory only; not a unique-feature count or pass claim'))
writecsv('catalogue-inventory.csv',catalog)

surface=[]
for p in sorted((ROOT/'packages/extension/src').rglob('*.ts')):
    rel=str(p.relative_to(ROOT))
    if p.name.endswith('.test.ts') or p.name.endswith('.d.ts'):continue
    surface.append(dict(kind='module',name=p.stem,source=rel,line=1,runtime_status='UNTESTED_AS_COMPLETE_FEATURE'))
    for i,l in enumerate(p.read_text().splitlines(),1):
        for m in re.finditer(r"case\s+'([A-Z][A-Z_0-9]+)'\s*:",l):surface.append(dict(kind='message-case',name=m[1],source=rel,line=i,runtime_status='UNTESTED_AS_COMPLETE_FEATURE'))
for p in sorted((ROOT/'packages').glob('mcp-*/src/**/*.ts')):
    for i,l in enumerate(p.read_text().splitlines(),1):
        if 'server.tool(' in l:
            lines=p.read_text().splitlines(); chunk=' '.join(lines[i-1:i+2]);m=re.search(r"server\.tool\(\s*['\"]([^'\"]+)",chunk)
            if m:surface.append(dict(kind='mcp-tool',name=m[1],source=str(p.relative_to(ROOT)),line=i,runtime_status='UNTESTED_INSTALLED_EXTENSION_END_TO_END'))
writecsv('implementation-surface.csv',surface)
phases=Counter(r['section'] for r in manual)
source_hashes={n:hashlib.sha256((ROOT/n).read_bytes()).hexdigest() for n in ['docs/e2e-testcases.md','FEATURES.md','DESIGN-PANEL.md','PARITY.md']}
counts=dict(base_commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),manual_total=len(manual),manual_untested=len(manual),manual_pass=0,manual_fail=0,manual_by_scope=dict(Counter(r['scope'] for r in manual)),manual_by_section=dict(phases),catalogue_claim_rows=len(catalog),catalogue_by_source=dict(Counter(r['source'] for r in catalog)),catalogue_by_kind=dict(Counter(r['kind'] for r in catalog)),implementation_rows=len(surface),implementation_by_kind=dict(Counter(r['kind'] for r in surface)),source_hashes=source_hashes)
(OUT/'counts.json').write_text(json.dumps(counts,indent=2)+'\n')
print(json.dumps(counts,indent=2))
