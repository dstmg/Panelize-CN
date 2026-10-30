import { COMPARE_MODES, buildComparisonPrompt, parseComparison, comparisonMarkdown } from './comparison-core.js';
import { createPanelActionResultWaiter } from './panel-action-results.js';

export function readPanelAnswer(panel, timeout=5000) {
  return new Promise(resolve=>{
    const requestId=`compare-${crypto.randomUUID()}`;
    let timer;
    const finish=value=>{clearTimeout(timer);window.removeEventListener('message',receive);resolve(value);};
    const receive=event=>{
      const d=event.data;
      if(event.source!==panel.iframe?.contentWindow||d?.type!=='PANELIZE_COMPARE_ANSWER'||d.context!=='multi-panel-comparison'||d.requestId!==requestId||d.provider!==panel.providerId)return;
      finish({text:typeof d.text==='string'?d.text.slice(0,40000):'',busy:!!d.busy,truncated:!!d.truncated,status:d.status,url:d.url,hasDraft:!!d.hasDraft});
    };
    window.addEventListener('message',receive);
    timer=setTimeout(()=>finish({text:'',status:'timeout'}),timeout);
    try{panel.iframe.contentWindow.postMessage({type:'PANELIZE_COMPARE_READ',context:'multi-panel',requestId},'*');}catch{finish({text:'',status:'error'});}
  });
}
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
function download(blob,name){const url=URL.createObjectURL(blob);const a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-');

export function initializeComparison(api) {
  if(!document.querySelector('.toolbar-right'))return;
  const open=node('button','回答对比','toolbar-btn compare-open');open.type='button';open.id='compare-answers-btn';
  open.title='只列各模型的不同回答，最后给出综合答案';
  const share=document.getElementById('share-snapshot-btn');
  document.querySelector('.toolbar-right').prepend(open);
  if(share){open.after(share);const label=share.querySelector('.btn-text');if(label)label.textContent='截图分享';}
  const modal=node('div',undefined,'compare-modal');modal.hidden=true;modal.id='answer-compare-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','answer-compare-title');
  const dialog=node('section',undefined,'compare-dialog');modal.append(dialog);
  const header=node('header',undefined,'compare-heading');header.append(node('h2','回答对比'));header.querySelector('h2').id='answer-compare-title';
  const close=node('button','关闭','compare-secondary');close.type='button';header.append(close);dialog.append(header);
  const body=node('div',undefined,'compare-body');dialog.append(body);
  const setup=node('details',undefined,'compare-setup');setup.open=true;setup.id='compare-setup';setup.append(node('summary','原文与分析设置'));const setupBody=node('div');setup.append(setupBody);body.append(setup);
  setupBody.append(node('p','先核对各平台的最后一条候选回答。不同步的追问、历史页面或仍在生成的回答可能不属于同一轮；图片和附件不纳入文本对比。','compare-note'));
  const capture=node('button','重新采集回答','compare-secondary');capture.type='button';setupBody.append(capture);
  const sourceGrid=node('div',undefined,'compare-sources');setupBody.append(sourceGrid);
  const question=node('textarea');question.id='compare-question';question.placeholder='原问题（可选；不填写时根据回答识别任务）';question.rows=2;question.maxLength=4000;
  const questionLabel=node('label','原问题');questionLabel.append(question);setupBody.append(questionLabel);
  const options=node('div',undefined,'compare-options');setupBody.append(options);
  const mode=node('select');mode.id='compare-mode';for(const [value,label] of Object.entries(COMPARE_MODES)){const option=node('option',label);option.value=value;mode.append(option);}
  const modeLabel=node('label','对比角度');modeLabel.append(mode);options.append(modeLabel);
  const target=node('select');target.id='compare-analyzer';const targetLabel=node('label','分析 AI（使用当前对话）');targetLabel.append(target);options.append(targetLabel);
  const focus=node('textarea');focus.id='compare-focus';focus.placeholder='自定义关注点，例如：结论为什么不同、计算口径、可执行性、表达风格';focus.rows=2;focus.maxLength=2000;
  const focusLabel=node('label','重点关注（可选）');focusLabel.append(focus);setupBody.append(focusLabel);
  const verified=node('input');verified.type='checkbox';verified.id='compare-verified';const verifiedLabel=node('label',undefined,'compare-check');verifiedLabel.append(verified,document.createTextNode('我已核对：所选原文完整，并且回答的是同一个问题'));setupBody.append(verifiedLabel);
  const previewButton=node('button','预览将发送的内容','compare-primary');previewButton.type='button';previewButton.id='compare-preview-button';setupBody.append(previewButton);
  const preview=node('section',undefined,'compare-preview');preview.hidden=true;setupBody.append(preview);
  const destination=node('p',undefined,'compare-note');preview.append(destination);
  const prompt=node('textarea');prompt.readOnly=true;prompt.rows=8;prompt.id='compare-prompt-preview';prompt.setAttribute('aria-label','将发送给分析 AI 的完整指令');preview.append(prompt);
  const confirm=node('button','确认发送并分析','compare-primary');confirm.type='button';confirm.id='compare-confirm-send';preview.append(confirm);
  const progress=node('p','尚未发送。采集和预览只在当前页面内处理。','compare-progress');progress.setAttribute('role','status');progress.id='compare-progress';body.append(progress);
  const resultActions=node('div',undefined,'compare-actions');body.append(resultActions);
  const retrieve=node('button','获取分析结果','compare-secondary');retrieve.type='button';retrieve.disabled=true;retrieve.id='compare-get-result';resultActions.append(retrieve);
  const stop=node('button','停止等待','compare-secondary');stop.type='button';stop.hidden=true;resultActions.append(stop);
  const manual=node('details');const manualTitle=node('summary','自动读取失败？粘贴分析 AI 的完整结果');manual.append(manualTitle);
  const manualText=node('textarea');manualText.rows=6;manualText.placeholder='粘贴分析结果 JSON，或包含 JSON 的完整回答';manualText.id='compare-manual-result';
  const manualParse=node('button','解析粘贴的结果','compare-secondary');manualParse.type='button';manual.append(manualText,manualParse);body.append(manual);
  const resultArea=node('section');resultArea.id='compare-result';body.append(resultArea);
  const exports=node('div',undefined,'compare-actions');exports.hidden=true;body.append(exports);
  const copy=node('button','复制对比结论','compare-secondary'),md=node('button','导出 Markdown','compare-secondary'),png=node('button','分享摘要图','compare-secondary');
  const save=node('button','保存到本地','compare-secondary');save.type='button';save.id='compare-save-local';
  for(const button of [copy,md,png,save]){button.type='button';exports.append(button);}
  const history=node('details',undefined,'compare-history');history.id='compare-history';history.append(node('summary','已保存的对比'));const historyList=node('div',undefined,'compare-history-list');history.append(historyList);body.append(history);
  document.body.append(modal);

    let rows=[],prepared=null,submitted=null,result=null,busy=false,collecting=false,pollTimer=null,waiting=false,lastFocus=null,previousRead='',lastStable='',stableCount=0;
  function invalidate(){prepared=null;preview.hidden=true;verified.checked=false;}
  function stopWaiting(){waiting=false;clearTimeout(pollTimer);pollTimer=null;stop.hidden=true;}
  function dismiss(){stopWaiting();modal.hidden=true;if(submitted&&!result)progress.textContent='已停止本地等待；平台上的生成不会因此取消。';lastFocus?.focus();}
  close.addEventListener('click',dismiss);
  modal.addEventListener('click',event=>{if(event.target===modal)dismiss();});
  modal.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.stopPropagation();dismiss();}
    if(event.key==='Tab'){
      const controls=[...dialog.querySelectorAll('button,input,select,textarea,summary')].filter(e=>!e.disabled&&e.getClientRects().length);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
    // Do not let the main page's Enter-to-send handler submit while editing the dialog.
    if(event.key==='Enter')event.stopPropagation();
  });
  for(const el of [question,focus,mode,target])el.addEventListener(el.tagName==='SELECT'?'change':'input',invalidate);
  function signature(){return JSON.stringify({question:question.value,focus:focus.value,mode:mode.value,target:target.value,rows:rows.map(r=>({name:r.name,text:r.textarea.value,selected:r.checkbox.checked}))});}
  function selected(){return rows.filter(r=>r.checkbox.checked).map(r=>({name:r.name,text:r.textarea.value.trim(),busy:r.busy,truncated:r.truncated,edited:r.edited,panelId:r.panelId}));}
  function lock(value){busy=value;confirm.disabled=value;capture.disabled=value;previewButton.disabled=value;for(const el of body.querySelectorAll('textarea,input,select,.compare-source button'))el.disabled=value;}
  function renderSources(){
    sourceGrid.replaceChildren();
    for(const row of rows){
      const card=node('article',undefined,'compare-source');const title=node('label',undefined,'compare-check');row.checkbox=node('input');row.checkbox.type='checkbox';row.checkbox.checked=row.selected??!!row.text;title.append(row.checkbox,document.createTextNode(row.name));card.append(title);
      const note=node('p',row.busy?'仍在生成，请等待或手动补全':row.truncated?'采集已截断，请手动补全':row.text?'候选回答，请核对轮次与完整性':'未采集到回答，可手动粘贴后勾选','compare-note');card.append(note);
      row.textarea=node('textarea');row.textarea.value=row.text;row.textarea.rows=7;row.textarea.maxLength=40000;row.textarea.setAttribute('aria-label',`${row.name} 回答原文`);row.textarea.placeholder='未识别到回答时，可将该平台的完整回答粘贴到这里。';card.append(row.textarea);
      const count=node('span',`${row.text.length} 字符`,'compare-count');card.append(count);
      row.textarea.addEventListener('input',()=>{row.edited=true;count.textContent=`${row.textarea.value.length} 字符（已手动编辑）`;note.textContent='已手动编辑，请核对完整性';invalidate();});row.checkbox.addEventListener('change',invalidate);
      const restore=node('button','使用网页采集文本','compare-secondary');restore.type='button';restore.addEventListener('click',()=>{row.textarea.value=row.capturedText||'';row.edited=false;count.textContent=`${row.textarea.value.length} 字符`;note.textContent=row.busy?'网页回答可能仍在生成，请等待':'已恢复采集文本，请核对轮次与完整性';invalidate();});card.append(restore);
      sourceGrid.append(card);
    }
  }
  async function collect(){
    if(busy||collecting)return;
    collecting=true;capture.disabled=true;previewButton.disabled=true;invalidate();stopWaiting();submitted=null;retrieve.disabled=true;result=null;exports.hidden=true;resultArea.replaceChildren();
    progress.textContent='正在读取各平台已加载的最后一条候选回答…';
    try{
      const panels=[...api.getPanels()];
      const edits=new Map(rows.filter(row=>row.edited).map(row=>[row.panelId,{text:row.textarea.value,selected:row.checkbox.checked}]));
      const selections=new Map(rows.map(row=>[row.panelId,row.checkbox.checked]));
      rows=await Promise.all(panels.map(async panel=>{const answer=await readPanelAnswer(panel);const edit=edits.get(panel.id);return {panelId:panel.id,name:api.name(panel),...answer,capturedText:answer.text,text:edit?.text??answer.text,edited:!!edit,selected:selections.get(panel.id)};}));
      renderSources();target.replaceChildren();
      for(const panel of panels){const option=node('option',api.name(panel));option.value=panel.id;target.append(option);}
      progress.textContent=`已读取 ${rows.filter(r=>r.text).length}/${rows.length} 份候选回答；请核对后预览。采集失败的项不会自动混入分析。`;
    }catch{progress.textContent='采集失败，请重试或手动粘贴回答。';}
    finally{collecting=false;capture.disabled=false;previewButton.disabled=false;}
  }
  let resumeChecked=false;
  open.addEventListener('click',async()=>{
    lastFocus=document.activeElement;modal.hidden=false;if(!result)setup.open=true;close.focus();
    if(!resumeChecked){
      resumeChecked=true;
      try{
        const saved=(await chrome.storage.local.get('cnComparisonDraftOnUpgrade')).cnComparisonDraftOnUpgrade;
        await chrome.storage.local.remove('cnComparisonDraftOnUpgrade');
        if(saved&&Date.now()-saved.timestamp<15*60*1000&&Array.isArray(saved.rows)){
          rows=saved.rows.map(row=>{const panel=api.getPanels().find(p=>api.name(p)===row.name);return {...row,panelId:panel?.id,capturedText:row.text,edited:true};});
          renderSources();target.replaceChildren();for(const panel of api.getPanels()){const option=node('option',api.name(panel));option.value=panel.id;target.append(option);}
          question.value=saved.question||'';focus.value=saved.focus||'';mode.value=saved.mode||'auto';
          progress.textContent='已保留更新前核对的原文；按新版规则重新分析后，只列不同点并直接回答原问题。';
          if(saved.result&&Array.isArray(saved.resultSources)){
            const sources=saved.resultSources.map(name=>rows.find(row=>row.name===name)).filter(Boolean);
            if(sources.length===saved.resultSources.length){submitted={sources};const parsed=parseComparison(JSON.stringify(saved.result),sources);drawResult(parsed);resultArea.prepend(node('p','这是上一次分析按新版布局重新展示的结果；未重新发送。最后的结论沿用上次分析，重新分析后将生成直接回答原问题的综合答案。','compare-note'));}
          }
          return;
        }
      }catch{progress.textContent='原分析暂未恢复，可重新采集回答。';}
    }
    if(!rows.length){question.value=api.question?.()||'';void collect();}
  });
  capture.addEventListener('click',()=>void collect());
  previewButton.addEventListener('click',()=>{
    try{
      if(!verified.checked)throw Error('请先核对并勾选原文完整、问题相同。');
      const sources=selected();const analyzer=api.getPanels().find(p=>p.id===target.value);if(!analyzer)throw Error('请先选择当前打开的分析 AI。');
      const text=buildComparisonPrompt({question:question.value,focus:focus.value,mode:mode.value,sources});
      prepared={sources,analyzer,prompt:text,signature:signature()};prompt.value=text;
      destination.textContent=`将把 ${sources.map(s=>s.name).join('、')} 的回答发送到「${api.name(analyzer)}」的当前对话，共 ${text.length} 字符。该平台会接收到这些原文；目标有未发送草稿时会停止。此操作会新增一条分析请求。`;
      confirm.textContent=`确认发送到 ${api.name(analyzer)} 并分析`;preview.hidden=false;confirm.disabled=false;progress.textContent='尚未发送。请确认下面的完整指令和目标平台。';
    }catch(error){progress.textContent=error.message;}
  });
  function drawResult(parsed){
    result=parsed;resultArea.replaceChildren();
    resultArea.append(node('h2','各模型回答的不同点'));
    if(!parsed.differences.length) resultArea.append(node('p','本次没有识别到实质不同点。'));
    else {
      const cards=node('div',undefined,'compare-model-cards');
      submitted.sources.forEach((source,index)=>{
        const card=node('article',undefined,'compare-model-card');card.append(node('h3',source.name));
        const items=parsed.differences.flatMap(row=>row.views.filter(v=>v.source===`S${index+1}`).map(view=>({dimension:row.dimension,...view})));
        const list=node('ol');
        for(const view of items){
          const item=node('li');item.append(node('strong',view.dimension+'：'),document.createTextNode(view.claim));
          if(view.quote){const evidence=node('details',undefined,'compare-evidence');evidence.append(node('summary',view.matched?'查看对应原文':'查看引用（尚未匹配）'),node('blockquote',view.quote));item.append(evidence);}
          list.append(item);
        }
        card.append(items.length?list:node('p','未识别到可单独列出的实质不同点。','compare-note'));cards.append(card);
      });
      resultArea.append(cards);
    }
    const final=node('section',undefined,'compare-final-answer');final.append(node('h2','综合回答'),node('p',parsed.summary));resultArea.append(final);
    resultArea.append(node('p','仅展示本次回答的不同点。综合回答由分析 AI 归纳，事实与计算仍需核对。','compare-note'));
    exports.hidden=false;setup.open=false;manual.open=false;progress.textContent='已逐个列出不同点，综合回答放在最后。';
    requestAnimationFrame(()=>resultArea.scrollIntoView({block:'start',behavior:'smooth'}));
  }
  async function fetchResult(automatic=false){
    if(!submitted?.analyzer)return false;
    const analyzer=api.getPanels().find(p=>p.id===submitted.analyzer.id&&p.iframe===submitted.analyzer.iframe);
    if(!analyzer)throw Error('分析面板已关闭或切换，请到平台查看结果，或手动粘贴。');
    const answer=await readPanelAnswer(analyzer);
    if(answer.truncated)throw Error('分析结果采集被截断，请手动粘贴完整 JSON，或在平台内查看。');
    if(answer.status!=='candidate'||!answer.text||answer.text===previousRead||answer.busy){if(!automatic)progress.textContent='尚未发现新的完整分析回答，可稍后再次获取或手动粘贴。';return false;}
    if(automatic){if(answer.text!==lastStable){lastStable=answer.text;stableCount=1;return false;}if(++stableCount<2)return false;}
    const parsed=parseComparison(answer.text,submitted.sources);drawResult(parsed);stopWaiting();return true;
  }
  async function poll(deadline){
    if(!waiting||modal.hidden)return;
    try{if(await fetchResult(true))return;}catch(error){if(Date.now()>deadline){progress.textContent=`${error.message} 可点击“获取分析结果”或手动粘贴。`;stopWaiting();return;}}
    if(Date.now()>deadline){progress.textContent='已停止自动等待，平台可能仍在生成；可稍后获取或手动粘贴，不会自动重发。';stopWaiting();return;}
    pollTimer=setTimeout(()=>void poll(deadline),3000);
  }
  confirm.addEventListener('click',async()=>{
    if(busy||!prepared)return;
    if(signature()!==prepared.signature||!verified.checked){progress.textContent='内容或目标已变化，请重新核对和预览。';return;}
    const attempt=prepared;lock(true);stopWaiting();
    try{
      const baseline=await readPanelAnswer(attempt.analyzer);if(baseline.status==='timeout'||baseline.status==='error')throw Error('无法确认目标平台当前状态，请先刷新该平台或换一家分析 AI。');
      if(modal.hidden)throw Error('对比窗口已关闭，没有继续填入和发送。');
      if(baseline.busy)throw Error('分析 AI 仍在生成，请等待结束。');if(baseline.hasDraft)throw Error('分析 AI 的输入框有未发送草稿，请先处理；本次没有覆盖或发送。');
      previousRead=baseline.text||'';submitted=attempt;result=null;exports.hidden=true;resultArea.replaceChildren();
      progress.textContent='正在将你确认的分析指令填入目标平台…';
      const fill=await api.fill(attempt.analyzer,attempt.prompt,[],`compare-fill-${crypto.randomUUID()}`,false);
      if(!fill.ok)throw Error('填入未得到确认，没有继续发送；请查看目标平台输入框。');
      if(modal.hidden)throw Error('对比窗口已关闭，没有继续发送；目标输入框可能已有分析草稿，请查看。');
      const requestId=`compare-submit-${crypto.randomUUID()}`;const waiter=createPanelActionResultWaiter({target:window,panel:attempt.analyzer,requestId,action:'send',timeoutMs:8000});
      attempt.analyzer.iframe.contentWindow.postMessage({type:'PANELIZE_CN_SUBMIT',context:'multi-panel',requestId,providerMode:api.providerMode(attempt.analyzer)},'*');
      const sent=await waiter.promise;prepared=null;preview.hidden=true;retrieve.disabled=false;
      if(!sent.ok){progress.textContent='未确认发送成功，请先查看目标平台；不会自动重发。若平台已产生结果，可点击获取。';return;}
      progress.textContent='已点击目标平台发送按钮，正在等待结构化分析结果。';waiting=true;lastStable='';stableCount=0;stop.hidden=false;void poll(Date.now()+120000);
    }catch(error){progress.textContent=error.message;prepared=null;preview.hidden=true;retrieve.disabled=!submitted;}
    finally{lock(false);}
  });
  retrieve.addEventListener('click',()=>{void fetchResult(false).catch(error=>{progress.textContent=error.message;});});
  stop.addEventListener('click',()=>{stopWaiting();progress.textContent='已停止本地等待；不会取消平台生成，也不会重发。';});
  manualParse.addEventListener('click',()=>{try{if(!submitted){const sources=selected();buildComparisonPrompt({sources});submitted={sources};}drawResult(parseComparison(manualText.value,submitted.sources));stopWaiting();}catch(error){progress.textContent=error.message;}});
  copy.addEventListener('click',()=>{if(result)void navigator.clipboard.writeText(comparisonMarkdown(result,submitted.sources)).then(()=>{progress.textContent='已复制对比结论。';}).catch(()=>{progress.textContent='复制失败，可使用导出 Markdown。';});});
  md.addEventListener('click',()=>{if(result)download(new Blob([comparisonMarkdown(result,submitted.sources)],{type:'text/markdown;charset=utf-8'}),`回答对比-${stamp()}.md`);});
  png.addEventListener('click',()=>{if(result)void shareSummaryImage(result,submitted.sources).catch(()=>{progress.textContent='图片生成失败，可导出 Markdown。';});});
  const renderHistory=async()=>{try{const entries=(await chrome.storage.local.get({cnSavedComparisons:[]})).cnSavedComparisons;historyList.replaceChildren();if(!entries.length){historyList.append(node('p','还没有保存的对比。'));return;}for(const entry of entries){const row=node('div',undefined,'compare-history-row'),info=node('div');info.append(node('strong',entry.question||entry.topic||'未命名问题'),node('small',new Date(entry.savedAt).toLocaleString()));const load=node('button','查看','compare-secondary'),remove=node('button','删除','compare-secondary');load.addEventListener('click',()=>{stopWaiting();prepared=null;preview.hidden=true;retrieve.disabled=true;submitted={sources:entry.sources};question.value=entry.question||'';setup.open=false;drawResult(parseComparison(JSON.stringify(entry.result),entry.sources));modal.hidden=false;});remove.addEventListener('click',async()=>{const current=(await chrome.storage.local.get({cnSavedComparisons:[]})).cnSavedComparisons;await chrome.storage.local.set({cnSavedComparisons:current.filter(x=>x.id!==entry.id)});await renderHistory();});row.append(info,load,remove);historyList.append(row);}}catch{historyList.textContent='读取本地记录失败，请检查扩展存储空间。';}};
  save.addEventListener('click',async()=>{if(!result||!submitted)return;try{const entries=(await chrome.storage.local.get({cnSavedComparisons:[]})).cnSavedComparisons;entries.unshift({id:crypto.randomUUID(),savedAt:Date.now(),question:question.value.trim(),topic:result.topic,sources:submitted.sources.map(s=>({name:s.name,text:s.text})),result});await chrome.storage.local.set({cnSavedComparisons:entries.slice(0,100)});progress.textContent='已保存到本地设置数据；卸载扩展前请导出备份。';await renderHistory();}catch{progress.textContent='保存失败，请检查扩展存储空间。';}});
  void renderHistory();
}

export async function shareSummaryImage(result,sources) {
  const width=1600,padding=60,lineHeight=34;
  const measure=document.createElement('canvas').getContext('2d');measure.font='24px sans-serif';
  const lines=[];
  const add=(text,size=24,bold=false)=>{
    measure.font=`${bold?'bold ':''}${size}px sans-serif`;
    for(const paragraph of String(text).split('\n')){let line='';for(const char of paragraph){if(measure.measureText(line+char).width>width-padding*2){lines.push({text:line,size,bold});line=char;}else line+=char;}lines.push({text:line,size,bold});}
    lines.push({text:'',size:12});
  };
  add('各模型回答的不同点',38,true);
  sources.forEach((source,index)=>{
    add(source.name,28,true);
    const items=result.differences.flatMap(row=>row.views.filter(v=>v.source===`S${index+1}`).map(view=>({dimension:row.dimension,...view})));
    if(!items.length)add('未识别到可单独列出的实质不同点。',22);
    items.slice(0,10).forEach((view,i)=>add(`${i+1}. ${view.dimension}：${view.claim}`.slice(0,400),22));
  });
  add('综合回答',28,true);add(result.summary.slice(0,2000));
  add('分享图为结论节选，完整维度及原文引用请导出 Markdown。AI 归纳不等于事实核验。',20);
  const height=padding*2+lines.reduce((n,l)=>n+Math.max(lineHeight,l.size+10),0);
  if(height>22000)throw Error('Image too long');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle='#f6f8fc';ctx.fillRect(0,0,width,height);ctx.fillStyle='#142b48';
  let y=padding;for(const line of lines){ctx.font=`${line.bold?'bold ':''}${line.size}px sans-serif`;ctx.fillText(line.text,padding,y+line.size);y+=Math.max(lineHeight,line.size+10);}
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('No image');download(blob,`回答对比摘要-${stamp()}.png`);
}
