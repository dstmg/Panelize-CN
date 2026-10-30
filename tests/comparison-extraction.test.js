import { readFileSync } from 'node:fs';import { resolve } from 'node:path';
const source=readFileSync(resolve(process.cwd(),'content-scripts/text-injection-all-providers.js'),'utf8');
describe('candidate answer extraction',()=>{
  let parent,original;
  beforeAll(()=>{original=window.parent;parent={postMessage:vi.fn()};Object.defineProperty(window,'parent',{configurable:true,value:parent});window.eval(source);});
  afterAll(()=>Object.defineProperty(window,'parent',{configurable:true,value:original}));
  beforeEach(()=>{window.happyDOM.setURL('https://chat.deepseek.com/');parent.postMessage.mockClear();document.body.innerHTML='';});
  function read(sender=parent){for(const e of document.querySelectorAll('*'))e.getClientRects=()=>[{width:100,height:40}];window.dispatchEvent(new MessageEvent('message',{source:sender,data:{type:'PANELIZE_COMPARE_READ',context:'multi-panel',requestId:'read-1'}}));return parent.postMessage.mock.calls.map(([data])=>data).find(data=>data.type==='PANELIZE_COMPARE_ANSWER');}
  it('takes the last assistant candidate and omits user and navigation text',()=>{
    document.body.innerHTML='<aside><div class="ds-markdown">history</div></aside><div class="ds-markdown">old</div><div class="ds-markdown"><p>latest</p><button>Copy</button><script>bad()</script></div><div data-role="user"><div class="ds-markdown">user words</div></div>';
    const result=read();expect(result.text).toBe('latest');expect(result.candidates).toBe(2);
  });
  it('never falls back to the whole page when no assistant is found',()=>{
    document.body.innerHTML='<nav>account info</nav><textarea>draft</textarea><main>random text</main>';
    const result=read();expect(result.text).toBe('');expect(result.status).toBe('not-found');expect(result.hasDraft).toBe(true);
  });
  it('flags possible generation and truncation',()=>{
    document.body.innerHTML='<div class="ds-markdown">'+'x'.repeat(40001)+'</div><button aria-label="停止生成"></button>';
    const result=read();expect(result.truncated).toBe(true);expect(result.text).toHaveLength(40000);expect(result.busy).toBe(true);
  });
  it('rejects another window',()=>{expect(read({})).toBeUndefined();});
  it('selects Kimi final markdown instead of the tool or reasoning segment',()=>{
    window.happyDOM.setURL('https://www.kimi.com/chat/example');
    document.body.innerHTML='<div class="chat-content-item-assistant"><div class="markdown-container toolcall-content-text"><div class="markdown">internal tool text</div></div><div class="markdown-container"><div class="markdown"><p>final answer</p></div></div></div>';
    expect(read().text).toBe('final answer');
  });
  it('supports current Qianwen qk markdown and selects the last completed segment',()=>{
    window.happyDOM.setURL('https://www.qianwen.com/chat/example');
    document.body.innerHTML='<div class="qk-markdown">thinking</div><div class="qk-markdown qk-markdown-complete"><p>final answer</p></div>';
    expect(read().text).toBe('final answer');
  });
  it('preserves separators between table cells',()=>{
    document.body.innerHTML='<div class="ds-markdown"><table><tr><td>访客</td><td>1200</td></tr><tr><td>支付</td><td>24</td></tr></table></div>';
    expect(read().text).toContain('访客\t1200');
  });
});
