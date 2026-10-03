// Firefox's native sidebar runs fixed actions, never code received in a message.
const window = typeof content === 'undefined' ? undefined : content;
const document = typeof content === 'undefined' ? undefined : content.document;
const panelActions = Object.freeze({
  residualContext: async () => ({url:window.location.href,tabs:await (window.wrappedJSObject?.browser || window.browser || window.chrome).tabs.query({})}),
  inspectEffectRows: async () => [...document.querySelectorAll('[data-dm-effect-row]')].map(e => ({id:e.dataset.dmEffectId,text:e.textContent,toggle:e.querySelector('[data-dm-effect-toggle]').title})),
  dragEffectRow: async ({from,to}) => {
    const rows=document.querySelectorAll('[data-dm-effect-row]');
    const transfer=new window.DataTransfer();
    rows[from].dispatchEvent(new window.DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));
    rows[to].dispatchEvent(new window.DragEvent('drop',{bubbles:true,dataTransfer:transfer}));
    return true;
  },
  focusState: async () => ({active:document.activeElement?.outerHTML,hasFocus:document.hasFocus()}),
  scrollSelector: async selector => {document.querySelector(selector).scrollIntoView({block:'center'});return true;},
  editRichText: async html => {const e=document.querySelector('[contenteditable="true"]');if(!e)throw Error('Missing rich text editor');e.focus();e.innerHTML=html;e.dispatchEvent(new window.Event('input',{bubbles:true}));e.blur();e.dispatchEvent(new window.FocusEvent('focusout',{bubbles:true}));return true;},
  inspectGeometry: async selector => [...document.querySelectorAll(selector)].map(e=>({text:e.textContent,rect:e.getBoundingClientRect().toJSON(),clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,style:{display:window.getComputedStyle(e).display,color:window.getComputedStyle(e).color},viewport:{width:window.innerWidth,height:window.innerHeight}})),
  readTokenTab: async () => (window.wrappedJSObject?.browser || window.browser || window.chrome).storage.session.get('dm-tokens-tab'),
  inspectControls: async selector => [...document.querySelectorAll(selector)].map(e=>({value:e.value,prop:e.dataset.dmProp,title:e.title,active:e.dataset.active,token:e.dataset.dmPickColor})),
  modifiedClick: async ({selector,shiftKey=false}) => {document.querySelector(selector).dispatchEvent(new window.MouseEvent('click',{bubbles:true,shiftKey}));return true;},
  searchColor: async value => {const e=document.querySelector('[data-dm-color-search]') || document.activeElement;if(!e || !('value' in e))throw Error('Missing color search');e.value=value;e.dispatchEvent(new window.Event('input',{bubbles:true}));return true;},
  inspectSelector: async selector => [...document.querySelectorAll(selector)].map(e => ({text:e.textContent,html:e.outerHTML,value:e.value,disabled:e.disabled,checked:e.checked,attributes:Object.fromEntries([...e.attributes].map(a=>[a.name,a.value]))})),
  importFile: async ({selector,name,text}) => {
    const input=document.querySelector(selector);
    if(!input)throw Error('Missing '+selector);
    const transfer=new window.DataTransfer();
    transfer.items.add(new window.File([text],name,{type:'application/json'}));
    input.files=transfer.files;
    input.dispatchEvent(new window.Event('change',{bubbles:true}));
    return true;
  },
  sendMessage: async ({base, message}) => {
    const tabs=await (window.wrappedJSObject?.browser || window.browser || window.chrome).tabs.query({});const t=tabs.find(t=>t.url?.startsWith(base));return (window.wrappedJSObject?.browser || window.browser || window.chrome).runtime.sendMessage(message.type.startsWith('SP_')?{...message,targetTabId:t.id}:message);
  },
  clickAction: async (action) => {
    document.querySelector('[data-dm-action="'+window.CSS.escape(action)+'"]').click();return true
  },
  panelText: async () => {
    return document.body.innerText
  },
  editProperty: async ({prop,value}) => {
    const i=document.querySelector('input[data-dm-prop="'+window.CSS.escape(prop)+'"]');i.value=value;i.dispatchEvent(new window.Event('input',{bubbles:true}));i.dispatchEvent(new window.Event('change',{bubbles:true}));return true
  },
  hideElement: async () => {
    document.querySelector('button[title="Hide element"]').click();return true
  },
  readSession: async (key) => {
    const s=await (window.wrappedJSObject?.browser || window.browser || window.chrome).storage.session?.get(key),l=await (window.wrappedJSObject?.browser || window.browser || window.chrome).storage.local.get(key);return JSON.stringify({session:s?.[key],local:l[key]})
  },
  seedLegacyOrigin: async ({key,session}) => {
    const area=session?(window.wrappedJSObject?.browser || window.browser || window.chrome).storage.session:(window.wrappedJSObject?.browser || window.browser || window.chrome).storage.local;const data=await area.get(key);data[key].domChanges[0].origin.parentSelector='';await area.set(data);return true
  },
  commentOnPageA: async () => {
    const t=document.querySelector('textarea[data-dm-comment-input]');t.value='Only page A';t.dispatchEvent(new window.Event('input',{bubbles:true}));return true
  },
  showChanges: async () => {
    document.querySelector('[data-dm-tab="changes"]').click();return true
  },
  clickSelector: async (selector) => {
    const e=document.querySelector(selector);if(!e)throw Error('Missing '+selector);e.click();return true
  },
  panelFontEvidence: async () => {
    const loaded = await document.fonts.load('450 13px Inter');
    await document.fonts.ready;
    const visible = [...document.querySelectorAll('body *')].filter(e => e.getClientRects().length && !e.closest('code, pre, svg') && (e.matches('input,button,select,textarea') || [...e.childNodes].some(n=>n.nodeType===3 && n.textContent.trim())));
    return {body:{family:window.getComputedStyle(document.body).fontFamily,size:window.getComputedStyle(document.body).fontSize},
      loaded:loaded.map(f=>({family:f.family,status:f.status,weight:f.weight})),
      fontSources:[...document.styleSheets].flatMap(s=>[...s.cssRules]).filter(r=>r.type===5).map(r=>({family:r.style.getPropertyValue('font-family'),src:r.style.getPropertyValue('src'),base:document.baseURI})),
      viewport:{width:window.innerWidth,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth},
      controls:visible.map(e=>({tag:e.tagName,text:(e.textContent||e.value||'').slice(0,70),family:window.getComputedStyle(e).fontFamily,size:window.getComputedStyle(e).fontSize,rect:e.getBoundingClientRect().toJSON()}))};
  },
  overlayColourInput: async ({setting, values}) => {
    const selector = '[data-dm-setting="' + window.CSS.escape(setting) + '"]';
    const input = document.querySelector(selector);
    if (!input || input.type !== 'color') throw Error('Missing colour input ' + setting);
    input.focus();
    const steps = [];
    for (const value of values) {
      input.value = value;
      input.dispatchEvent(new window.Event('input', {bubbles:true}));
      steps.push({value:input.value, label:document.querySelector(selector)?.previousElementSibling?.textContent,
        connected:input.isConnected, sameNode:document.querySelector(selector) === input, focused:document.activeElement === input});
    }
    input.dispatchEvent(new window.Event('change', {bubbles:true}));
    return steps;
  },
  overlayColourSettings: async () => {
    const keys = ['dm-inspector-hover-color','dm-inspector-select-color','dm-overlay-margin-color','dm-overlay-padding-color'];
    return {controls:[...document.querySelectorAll('input[type="color"][data-dm-setting]')].map(e=>({setting:e.dataset.dmSetting,value:e.value,label:e.previousElementSibling.textContent})),
      saved:await (window.wrappedJSObject?.browser || window.browser || window.chrome).storage.local.get(keys)};
  },
  inputSelector: async ({selector,value}) => {
    const e=document.querySelector(selector);if(!e)throw Error('Missing '+selector);e.focus();e.value=value;e.dispatchEvent(new window.Event('input',{bubbles:true}));e.dispatchEvent(new window.Event('change',{bubbles:true}));e.blur();return true
  },
  resetSettingsEvidence: async () => {
    return {values:['nudge-amount','marginColor','paddingColor'].map(x=>document.querySelector('[data-dm-setting="'+x+'"]').value),saved:await (window.wrappedJSObject?.browser || window.browser || window.chrome).storage.local.get(['dm-nudge-amount','dm-input-unit','dm-overlay-margin-color','dm-overlay-padding-color'])}
  },
  backgroundControls: async () => {
    return {download:!!document.querySelector('[data-dm-action="download-media"]'),text:document.body.innerText}
  },
  editMcpProperty: async ({prop,value}) => {
    const i=document.querySelector('input[data-dm-prop="'+window.CSS.escape(prop)+'"]');if(!i)throw Error('missing '+prop);i.value=value;i.dispatchEvent(new window.Event('input',{bubbles:true}));i.dispatchEvent(new window.Event('change',{bubbles:true}));
  },
  configureMcp: async (port) => {
    await (window.wrappedJSObject?.browser || window.browser || window.chrome).storage.local.set({'dm-mcp-mode':'local','dm-mcp-port':port,'dm-mcp-auto-connect':true});
  },
  editToken: async () => {
    const i=document.querySelector('[data-dm-token-edit="--cert-space"]');if(!i)throw Error('token control missing');i.value='24px';i.dispatchEvent(new window.Event('input',{bubbles:true}));
  },
  tokenControls: async () => {
    return [...document.querySelectorAll("[data-dm-token-edit]")].map(x=>x.outerHTML)
  },
  elementComment: async () => {
    const t=document.querySelector('textarea[data-dm-comment-input]');t.value='MCP synthetic element comment';t.dispatchEvent(new window.Event('input',{bubbles:true}));
  },
  regionComment: async () => {
    const t=document.querySelector('textarea[data-dm-comment-input]');t.value='MCP synthetic region comment';t.dispatchEvent(new window.Event('input',{bubbles:true}));
  },
  showDesign: async () => {
    document.querySelector('[data-dm-tab="design"]').click()
  }
});

if (typeof module !== 'undefined') {
  module.exports = panelActions;
} else {
  addMessageListener('dm-certification:request', async ({ data }) => {
    const { id, action, arg } = data;
    try {
      if (!Object.hasOwn(panelActions, action)) throw new Error('Unknown panel action: ' + action);
      const value = await panelActions[action](arg);
      sendAsyncMessage('dm-certification:reply', { id, value });
    } catch (error) {
      sendAsyncMessage('dm-certification:reply', { id, error: String(error) });
    }
  });
  sendAsyncMessage('dm-certification:ready', {});
}
