const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
require('tsx/cjs');
const { attachWebSocketServer, stopWebSocketServer } = require('../../mcp-local/src/websocket-server.ts');
async function probe(args) {
  const w = window.wrappedJSObject || window;
  const api = w.browser || w.chrome;
  if (args.message) { const tab=(await api.tabs.query({})).find(t=>t.url?.startsWith(args.base)); return api.runtime.sendMessage({type:args.message,tabId:tab.id}); }
  if (args.mutePresence) {
    const tab=(await api.tabs.query({})).find(t=>t.url?.startsWith(args.base));
    await api.scripting.executeScript({target:{tabId:tab.id},func:()=>{
      const api=globalThis.browser||globalThis.chrome;
      const original=api.runtime.sendMessage.bind(api.runtime);
      api.runtime.sendMessage=(message,...rest)=>message.type==='AGENT_PRESENCE_UPDATE'?Promise.resolve():original(message,...rest);
    }});
  }
  if (args.saved) await api.storage.local.set(args.saved);
  if (args.click) { const el = w.document.querySelector(args.click); if (!el) throw Error('missing ' + args.click); el.click(); }
  return { saved: await api.storage.local.get(['dm-mcp-auto-connect','dm-mcp-mode']), text: w.document.body.innerText, toasts: [...w.document.querySelectorAll('div[style*="position:fixed;bottom:14px"]')].map(el=>el.textContent) };
}
module.exports = async h => {
  let {panelPage, context, driver, send, wait, out, screenshot, navigate, base} = h;
  async function p(args = {}) {
    if (!driver) return panelPage.evaluate(probe, args).catch(error=>({error:String(error)}));
    await driver.setContext('chrome');
    return driver.executeAsyncScript(function(source,args,done) {
      const mm=document.getElementById('sidebar').contentDocument.getElementById('webext-panels-browser').messageManager;
      const topic='mcp-settings-probe'; const listener=m=>{mm.removeMessageListener(topic,listener);done(m.data)};
      mm.addMessageListener(topic,listener);
      mm.loadFrameScript('data:application/javascript,'+encodeURIComponent('const window=content;\n'+source+'\nprobe('+JSON.stringify(args)+').then(v=>sendAsyncMessage("'+topic+'",v),e=>sendAsyncMessage("'+topic+'",{error:String(e)}));'),false);
    },probe.toString(),args);
  }
  async function message(type) {
    return p({message:type,base});
  }
  async function reopen() {
    if (driver) {
      await driver.setContext('chrome'); await driver.executeScript(()=>SidebarController.hide()); await wait(500);
      await driver.executeAsyncScript(done=>SidebarController.show('sandeepbaskaran98_gmail_com-sidebar-action').then(()=>done()));
    } else { const url=panelPage.url(); await panelPage.close(); await wait(500); panelPage=await context.newPage(); await panelPage.goto(url); }
    await wait(1500);
  }
  const checks=[]; const record=(name,ok,evidence)=>{checks.push({name,ok,evidence});fs.writeFileSync(path.join(out,'mcp-settings.json'),JSON.stringify({version:h.version,checks},null,2));};
  let health=0, sockets=0;
  const token='synthetic-mcp-settings-token';
  const server=http.createServer((req,res)=>{health++;res.setHeader('content-type','application/json');res.end(JSON.stringify({identity:'design-mode-mcp',webSocketToken:token}));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r)); const port=server.address().port;
  const wss=attachWebSocketServer(server,token);wss.on('connection',()=>sockets++);
  try {
    await p({saved:{'dm-mcp-mode':'local','dm-mcp-port':port,'dm-mcp-auto-connect':false}});
    await message('SP_DEACTIVATE_DESIGN_MODE');
    await navigate(base+'/saved-off-startup'); await wait(1200);
    record('0.7.7 saved-false fresh document startup does not dial',health===0&&sockets===0,{health,sockets,status:await message('SP_GET_MCP_STATUS')});
    await reopen();
    record('0.7.7 saved-false panel reopen does not dial',health===0&&sockets===0,{health,sockets,status:await message('SP_GET_MCP_STATUS'),ui:await p()});
    await p({click:'[data-dm-action="mcp"]'}); await wait(300);
    const manual=await p({click:'[data-dm-action="connect-mcp"]'}); await wait(700);
    record('0.7.7 explicit local Connect works while saved false',!manual.error&&sockets>0&&(await message('SP_GET_MCP_STATUS')).connected,{manual,health,sockets});
    // Mode changes are explicit connection intents, unlike activation.
    await p({click:'[data-dm-mcp-mode="cloud"]'});await wait(400);
    const before=sockets; await p({click:'[data-dm-mcp-mode="local"]'}); await wait(900);
    record('explicit mode change dials despite saved false',sockets>before,{before,sockets,status:await message('SP_GET_MCP_STATUS')});
    await message('SP_DEACTIVATE_DESIGN_MODE'); await wait(200);
    await p({click:'[data-dm-setting="autoConnect"]'}); await wait(200); await message('SP_ACTIVATE_DESIGN_MODE'); await wait(900);
    record('saved-true activation connects', (await message('SP_GET_MCP_STATUS')).connected,{health,sockets});
    await p({click:'[data-dm-setting="autoConnect"]'});await wait(200);
    const beforeToggleReopen=sockets;
    record('0.7.7 UI toggle persists false without dropping existing connection',(await p()).saved['dm-mcp-auto-connect']===false&&(await message('SP_GET_MCP_STATUS')).connected,await p());
    await reopen();
    record('0.7.7 toggle-off then reopen stays offline without dialing',sockets===beforeToggleReopen&&!(await message('SP_GET_MCP_STATUS')).connected,{beforeToggleReopen,sockets,ui:await p()});
    await p({click:'[data-dm-action="mcp"]'});await wait(300);
    await p({click:'[data-dm-action="connect-mcp"]'});await wait(900);
    record('0.7.7 manual Connect after toggle-off/reopen reconnects',(await message('SP_GET_MCP_STATUS')).connected,{sockets,ui:await p()});
    await p({click:'[data-dm-action="refresh-mcp"]'});await wait(350);
    record('0.7.3 unchanged connected refresh is silent',(await p()).toasts.length===0,await p());
    await p({mutePresence:true,base});
    for (const [connected, toast] of [[false,'MCP running — waiting for agent'],[true,'MCP connected']]) {
      for (const socket of wss.clients) socket.send(JSON.stringify({type:'AGENT_PRESENCE',payload:{connected}}));
      await wait(200);await p({click:'[data-dm-action="refresh-mcp"]'});await wait(350);
      record('0.7.3 changed refresh '+toast,(await p()).toasts.includes(toast),{faultInjection:'suppress unsolicited presence notification only; real socket and GET_MCP_STATUS retained',ui:await p()});
      await wait(2600);
      await p({click:'[data-dm-action="refresh-mcp"]'});await wait(350);
      record('0.7.3 unchanged refresh '+toast,(await p()).toasts.length===0,await p());
    }
    await message('SP_DEACTIVATE_DESIGN_MODE');await wait(200);
    await p({click:'[data-dm-action="refresh-mcp"]'});await wait(350);
    record('0.7.3 changed offline refresh shows toast',(await p()).toasts.includes('MCP offline'),await p());
    await wait(3500);await p({click:'[data-dm-action="refresh-mcp"]'});await wait(350);
    record('0.7.3 unchanged offline refresh is silent',(await p()).toasts.length===0,await p());
    if (!driver) await panelPage.screenshot({path:path.join(out,'final.png')}); else await screenshot('final');
  } finally { stopWebSocketServer(); await new Promise(r=>server.close(r)); }
  if(checks.some(c=>!c.ok)) throw Error('MCP contract failures: '+checks.filter(c=>!c.ok).map(c=>c.name).join('; '));
};
