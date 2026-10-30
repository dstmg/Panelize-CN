import { selectedPanels, orderProviders, executePanels, canRetry } from './cn-workflow.js';
import { createPanelActionResultWaiter, getPanelActionResultTimeoutMs } from './panel-action-results.js';

let api, preferences = {}, recent = [], busy = false, lastAttempt = null, revision = 0;
const readiness = new Map();
const labels = { loading:'正在加载', loaded:'网页已打开，状态待确认', ready:'可输入', login:'需要登录', timeout:'加载较久，可刷新或另开网页' };
export function sortDomesticProviders(providers) { return orderProviders(providers, recent); }
export function noteProviderUse(id) {
  recent = [id, ...recent.filter(v => v !== id)].slice(0, 20);
  void chrome.storage.local.set({ cnRecentProviders: recent });
}
function setStatus(panel, text) {
  const el = document.getElementById(panel.id)?.querySelector('.cn-panel-status');
  if (el) { el.textContent = text; el.title = text; }
}
function invalidateRetry() {
  revision++;
  lastAttempt = null;
  const button = document.getElementById('cn-retry');
  if (button) button.hidden = true;
}
export function syncCnControls() {
  if (!api) return;
  for (const panel of api.getPanels()) {
    const el = document.getElementById(panel.id);
    if (!el) continue;
    if (!el.querySelector('.cn-target')) {
      const label = document.createElement('label');
      label.className = 'cn-target'; label.title = '勾选后参与统一填入和发送';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
      checkbox.setAttribute('aria-label', '选择此平台参与发送');
      label.append(checkbox, document.createTextNode('参与发送'));
      el.querySelector('.panel-header-left').append(label);
      const status = document.createElement('div'); status.className = 'cn-panel-status'; status.setAttribute('role','status');
      el.querySelector('.panel-header').after(status);
      checkbox.addEventListener('change', () => {
        preferences[panel.providerId] = checkbox.checked;
        void chrome.storage.local.set({ cnPanelSelection: preferences });
        invalidateRetry(); syncCnControls();
      });
    }
    el.querySelector('.cn-target input').checked = preferences[panel.providerId] !== false;
    if (el.dataset.cnProvider !== panel.providerId) {
      if (el.dataset.cnProvider) invalidateRetry();
      el.dataset.cnProvider = panel.providerId;
      readiness.set(panel.id, {provider: panel.providerId, state:'loading', since:Date.now()});
      setStatus(panel, labels.loading);
    }
  }
  const selected = selectedPanels(api.getPanels(), preferences).length;
  const sendLabel=document.querySelector('#send-all-btn .btn-text');
  const fillLabel=document.querySelector('#fill-input-btn .btn-text');
  if(sendLabel) sendLabel.textContent = `发送给已选 ${selected} 个`;
  if(fillLabel) fillLabel.textContent = `填入已选 ${selected} 个`;
}
function refreshPageState(panel) {
  const row = readiness.get(panel.id);
  if (!row) return;
  if (row.state === 'loading' && Date.now() - row.since > 25000) {
    row.state = 'timeout';
    document.getElementById(panel.id)?.querySelector('.panel-loading')?.classList.add('hidden');
    setStatus(panel, labels.timeout);
  }
}
export async function initializeCnControls(callbacks) {
  if (!document.querySelector('#send-all-btn .btn-text')) return;
  api = callbacks;
  const stored = await chrome.storage.local.get({cnPanelSelection:{},cnRecentProviders:[]});
  preferences = stored.cnPanelSelection || {}; recent = stored.cnRecentProviders || [];
  syncCnControls();
  const observer = new MutationObserver(() => syncCnControls());
  observer.observe(document.getElementById('panel-grid'), {childList:true});
  window.addEventListener('message', event => {
    const data = event.data;
    if (data?.type !== 'PANELIZE_CN_READINESS' || !['ready','login','loaded'].includes(data.state)) return;
    const panel = api.getPanels().find(p => p.iframe?.contentWindow === event.source && p.providerId === data.provider);
    if (!panel) return;
    const old = readiness.get(panel.id);
    readiness.set(panel.id, {provider:panel.providerId,state:data.state,since:old?.state===data.state?old.since:Date.now()});
    if (old?.state !== data.state && !busy) setStatus(panel, labels[data.state]);
    document.getElementById(panel.id)?.querySelector('.panel-loading')?.classList.add('hidden');
  });
  document.getElementById('panel-grid').addEventListener('load', event => {
    if (event.target.tagName !== 'IFRAME') return;
    const panel = api.getPanels().find(p => p.iframe === event.target);
    if (!panel) return;
    const row = readiness.get(panel.id);
    if (!row || ['loading','timeout'].includes(row.state)) {
      readiness.set(panel.id, {provider:panel.providerId,state:'loaded',since:Date.now()});
      setStatus(panel, labels.loaded);
    }
  }, true);
  const retry = document.createElement('button'); retry.id='cn-retry'; retry.type='button';retry.hidden=true;retry.className='cn-retry';retry.textContent='重试明确失败项';
  retry.addEventListener('click', async () => {
    if (busy || !lastAttempt) return;
    const attempt = lastAttempt;
    await run(attempt.text, attempt.images, attempt.submit, attempt.ids, true);
  });
  document.querySelector('.input-actions').append(retry);
  document.getElementById('unified-input').addEventListener('input',invalidateRetry);
  for (const id of ['clear-all-btn','image-file-input','new-chat-btn','image-upload-btn']) document.getElementById(id)?.addEventListener(id==='image-file-input'?'change':'click',()=>{
    invalidateRetry();
    if (id==='clear-all-btn' || id==='new-chat-btn') {
      document.getElementById('send-status').textContent='';
      api.getPanels().forEach(panel=>setStatus(panel,labels[readiness.get(panel.id)?.state]||labels.loaded));
    }
  });
  const more = document.createElement('details');more.className='cn-more';
  const summary=document.createElement('summary');summary.textContent='更多';more.append(summary);
  const menu=document.createElement('div');menu.className='cn-more-menu';more.append(menu);
  for(const id of ['toggle-open-mode-btn','temporary-chat-btn','share-snapshot-btn']) {
    const button=document.getElementById(id);menu.append(button);
    if(!button.querySelector('.btn-text')) {const label=document.createElement('span');label.className='btn-text';label.textContent='临时对话';button.append(label);}
    button.addEventListener('click',()=>{more.open=false;});
  }
  document.querySelector('.toolbar-right').prepend(more);
  document.addEventListener('click',event=>{if(!more.contains(event.target))more.open=false;});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')more.open=false;});
  setInterval(()=>api.getPanels().forEach(refreshPageState),2000);
}
export async function broadcastCn(text, submit = true) {
  if (!api) return;
  const images = api.getImages().map(image=>({...image}));
  return run(text, images, submit, null, false);
}
async function run(text, images, submit, retryIds, retrying) {
  if (busy) return;
  let targets = selectedPanels(api.getPanels(), preferences);
  if (retryIds) targets = targets.filter(p => retryIds.includes(p.id));
  if (!targets.length) {api.toast('请先勾选至少一个平台');return;}
  if (!text.trim() && !images.length && !submit) {api.toast('请先输入问题或添加图片');return;}
  busy=true;
  const send=document.getElementById('send-all-btn'), fill=document.getElementById('fill-input-btn'), retry=document.getElementById('cn-retry');
  send.disabled=fill.disabled=retry.disabled=true;
  const status=document.getElementById('send-status');status.textContent='正在处理已选平台…';status.className='send-status';
  const revisionText = document.getElementById('unified-input').value;
  const attemptRevision = revision;
  try {
    const results = await executePanels({panels:targets,text,images,submit,
      status:setStatus,
      fill: async (panel, value, attachments) => {
        if (readiness.get(panel.id)?.state === 'login') return {ok:false,panelId:panel.id,reason:'control-not-found'};
        return api.fill(panel,value,attachments,`cn-fill-${crypto.randomUUID()}`,retrying);
      },
      send: async panel => {
        const requestId=`cn-send-${crypto.randomUUID()}`;
        const waiter=createPanelActionResultWaiter({target:window,panel,requestId,action:'send',timeoutMs:8000});
        panel.iframe.contentWindow.postMessage({type:'PANELIZE_CN_SUBMIT',context:'multi-panel',requestId,providerMode:api.providerMode(panel)},'*');
        return waiter.promise;
      }
    });
    for(const result of results) {
      if(result.ok) continue;
      const panel=targets.find(p=>p.id===result.panelId);
      setStatus(panel,readiness.get(panel.id)?.state==='login'?'需要登录后重试':result.phase==='send'?(result.reason==='control-not-found'?'未找到可用发送按钮，可检查后重试':'发送结果未确认，请先查看网页'):'填入失败，请检查登录、输入框或附件');
    }
    const ok=results.filter(r=>r.ok).length;
    status.textContent=`${submit?'已点击发送':'已填入'} ${ok}/${targets.length}，详情见各面板`;
    status.className=`send-status ${ok===targets.length?'success':'partial'}`;
    const ids=results.filter(canRetry).map(r=>r.panelId);
    lastAttempt=ids.length?{text,images,submit,ids}:null;
    retry.hidden=!lastAttempt;
    if (document.getElementById('unified-input').value !== revisionText || attemptRevision !== revision) invalidateRetry();
    if(ok && ok===targets.length && attemptRevision===revision && document.getElementById('unified-input').value===revisionText) api.filled();
    if(ok && submit) api.remember(text);
  } finally {
    busy=false;send.disabled=fill.disabled=retry.disabled=false;syncCnControls();
  }
}
