import json, os, pathlib, pty, signal, socket, subprocess, time, select
root=pathlib.Path(__file__).resolve().parents[3]
node=subprocess.check_output(['which','node'],text=True).strip()
cli=root/'packages/mcp-local/dist/bin/cli.js'
out=root/'.correction-evidence/lifecycle.json'
results=[]
def port():
 s=socket.socket();s.bind(('127.0.0.1',0));p=s.getsockname()[1];s.close();return p
def released(p):
 s=socket.socket()
 try:s.bind(('127.0.0.1',p));return True
 except OSError:return False
 finally:s.close()
for mode in ['immediate-pipe','dev-null']:
 p=port();proc=subprocess.Popen([node,str(cli)],cwd=root,env={'PATH':os.environ['PATH'],'DM_PORT':str(p)},stdin=subprocess.PIPE if mode=='immediate-pipe' else subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if proc.stdin:proc.stdin.close();proc.stdin=None
 stdout,stderr=proc.communicate(timeout=5)
 results.append({'id':'11.2f','mode':mode,'exit':proc.returncode,'portReleased':released(p),'stderr':stderr.decode()})
for sig in [signal.SIGINT,signal.SIGTERM]:
 p=port();master,slave=pty.openpty();proc=subprocess.Popen([node,str(cli)],cwd=root,env={'PATH':os.environ['PATH'],'DM_PORT':str(p)},stdin=slave,stdout=slave,stderr=slave);os.close(slave);output=b''
 for _ in range(80):
  readable,_,_=select.select([master],[],[],.1)
  if readable:output+=os.read(master,65536)
  if b'DESIGN MODE MCP READY' in output:break
 assert b'DESIGN MODE MCP READY' in output
 live=proc.poll() is None;proc.send_signal(sig)
 deadline=time.monotonic()+5
 while proc.poll() is None and time.monotonic()<deadline:
  readable,_,_=select.select([master],[],[],.1)
  if readable:
   try: output+=os.read(master,65536)
   except OSError: break
 if proc.poll() is None: proc.kill();proc.wait();raise AssertionError('signal did not exit')
 os.close(master)
 results.append({'id':'11.2g','signal':sig.name,'stayedAlive':live,'exit':proc.returncode,'portReleased':released(p)})
s=socket.socket();s.bind(('127.0.0.1',0));s.listen();p=s.getsockname()[1]
# A foreign HTTP server gives a bounded health-probe rejection.
import http.server,threading
s.close();server=http.server.ThreadingHTTPServer(('127.0.0.1',p),http.server.BaseHTTPRequestHandler);threading.Thread(target=server.serve_forever,daemon=True).start()
proc=subprocess.Popen([node,str(cli)],cwd=root,env={'PATH':os.environ['PATH'],'DM_PORT':str(p)},stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
try:
 proc.wait(timeout=8);stdout=proc.stdout.read();stderr=proc.stderr.read();alive=not released(p)
 results.append({'id':'11.2','exit':proc.returncode,'foreignAlive':alive,'stderr':stderr.decode()})
finally:
 if proc.poll() is None:proc.kill();proc.wait()
 server.shutdown();server.server_close()
assert all(x.get('portReleased',True) for x in results)
out.write_text(json.dumps(results,indent=2));print(json.dumps(results,indent=2))
