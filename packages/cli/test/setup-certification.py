import os, pathlib, subprocess, tempfile, json, socket, time, urllib.request, pty, select
root=pathlib.Path(__file__).resolve().parents[3]
node=__import__('shutil').which('node')
local=root/'packages/mcp-local/dist/bin/cli.js'
cli=pathlib.Path(os.environ.get('CERT_CLI',str(root/'packages/cli/dist/cli.cjs')))
env={'PATH':os.environ['PATH'],'HOME':str(root/'packages/cli/.test-artifacts/home'),'DM_CLOUD_TOKEN':'dm_disposable_diagnostic_sentinel'}
artifact_dir=root/'.correction-evidence/setup-runs'
artifact_dir.mkdir(parents=True,exist_ok=True)
base=pathlib.Path(tempfile.mkdtemp(prefix='cert-',dir=artifact_dir))
results=[]
def run(args,extra=None):
 p=subprocess.run([node,*map(str,args)],env=env| (extra or {}),cwd=root,capture_output=True,text=True,timeout=15)
 assert 'dm_disposable_diagnostic_sentinel' not in p.stdout+p.stderr
 return p
def record(name,p):
 results.append({'name':name,'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr})
def setup(project,*args): return run([local,'setup','--project',project,'--agent','all',*args])
def snapshot(d): return {str(p.relative_to(d)):(p.read_bytes(),p.stat().st_mode&0o777) for p in d.rglob('*') if p.is_file()}
def prompt(project,answer):
 master,slave=pty.openpty()
 p=subprocess.Popen([node,str(local),'setup','--project',str(project),'--agent','all','--apply'],env=env,cwd=root,stdin=slave,stdout=slave,stderr=slave)
 os.close(slave); output=b''; sent=False
 while p.poll() is None:
  ready,_,_=select.select([master],[],[],5)
  if not ready: p.kill(); raise AssertionError('prompt timeout')
  try: output+=os.read(master,65536)
  except OSError: break
  if b'[y/N]' in output and not sent: os.write(master,(answer+'\n').encode()); sent=True
 p.wait(timeout=5); os.close(master)
 assert sent
 results.append({'name':'prompt '+answer,'exit':p.returncode,'output':output.decode()})
 return p.returncode
project=base/'setup'; project.mkdir(); (project/'.cursor').mkdir()
originals={'.mcp.json':json.dumps({'settings':{'keep':True},'mcpServers':{'other':{'command':'other','env':{'KEEP':'sentinel-env'}}}}),'.cursor/mcp.json':'{// comment preserved in backup\n"mcpServers":{"other":{"command":"other","env":{"KEEP":"sentinel-env"}},},}'}
for name,text in originals.items():
 p=project/name;p.write_text(text);p.chmod(0o600)
before=snapshot(project)
p=setup(project);record('preview',p);assert p.returncode==0 and 'normalised' in p.stderr and snapshot(project)==before
assert prompt(project,'n')==1 and snapshot(project)==before
assert prompt(project,'y')==0
for name,text in originals.items():
 p=project/name; data=json.loads(p.read_text());assert data['mcpServers']['other']['env']['KEEP']=='sentinel-env'
 backups=list(p.parent.glob(p.name+'.bak-*'));assert len(backups)==1 and backups[0].read_text()==text
 assert p.stat().st_mode&0o777==0o600 and backups[0].stat().st_mode&0o777==0o600
 results.append({'name':'permissions '+name,'mode':oct(p.stat().st_mode&0o777),'originalMode':'0o600'})
after=snapshot(project);p=setup(project,'--apply','--yes');record('repeat',p);assert p.returncode==0 and snapshot(project)==after
for name,content in [('invalid','{broken'),('conflict','{"mcpServers":{"design-mode":{"command":"other","env":{"KEEP":"sentinel-env"}}}}')]:
 d=base/name;d.mkdir();f=d/'.mcp.json';f.write_text(content);before=snapshot(d);p=setup(d,'--apply','--yes');record(name,p);assert p.returncode==1 and snapshot(d)==before
 if name=='conflict':
  p=setup(d,'--apply','--yes','--force');record('forced conflict',p);assert p.returncode==0
  assert json.loads(f.read_text())['mcpServers']['design-mode']['env']['KEEP']=='sentinel-env'
  assert next(d.glob('.mcp.json.bak-*')).read_text()==content
for dangling in [False,True]:
 d=base/('symlink-'+str(dangling));d.mkdir();target=base/('target-'+str(dangling))
 if not dangling: target.write_text('{}')
 (d/'.mcp.json').symlink_to(target);p=setup(d,'--apply','--yes');record('symlink '+str(dangling),p)
 assert p.returncode==1 and (d/'.mcp.json').is_symlink()
 assert not target.exists() if dangling else target.read_text()=='{}'
 results.append({'name':'symlink retained '+str(dangling),'retained':(d/'.mcp.json').is_symlink(),'targetExists':target.exists()})
p=run([local,'setup','--project',project,'--agent','unsupported','--apply','--yes']);record('unsupported',p);assert p.returncode==1
s=socket.socket();s.bind(('127.0.0.1',0));port=s.getsockname()[1];s.close()
p=run([local,'doctor','--port',port]);record('doctor unavailable',p);assert p.returncode==1 and 'No Design Mode owner' in p.stderr
owner=subprocess.Popen([node,str(local)],cwd=root,env=env|{'DM_PORT':str(port)},stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(base/'owner.log').open('w'))
try:
 for i in range(100):
  try:
   with urllib.request.urlopen('http://127.0.0.1:'+str(port)+ '/.design-mode/health',timeout=.2) as r: health=json.load(r)
   break
  except Exception: time.sleep(.05)
 else: raise AssertionError('owner not ready')
 assert health['pid']==owner.pid
 for args,exitcode in [(['tools'],0),(['schema','apply_changes'],0),(['status'],4),(['call','get_session_summary'],0),(['call','clear_changes'],4)]:
  p=run([cli,'--mode','local',*args],{'DM_PORT':str(port)});record('local '+' '.join(args),p);assert p.returncode==exitcode
  assert health['webSocketToken'] not in p.stdout+p.stderr
 p=run([local,'doctor','--port',port]);record('doctor owner offline',p);assert p.returncode==1 and health['webSocketToken'] not in p.stderr
finally:
 owner.stdin.close();owner.wait(timeout=5)
p=run([cli,'--mode','local','status'],{'DM_PORT':str(port)});record('owner shutdown',p);assert p.returncode==3
(base/'evidence.json').write_text(json.dumps(results,indent=2))
print(json.dumps({'evidence':str(base/'evidence.json'),'checks':len(results),'permissions':[r for r in results if 'permissions' in r['name']],'symlinks':[r for r in results if 'symlink retained' in r['name']]},indent=2))
