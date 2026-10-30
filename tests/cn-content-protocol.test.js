import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const source = readFileSync(resolve(process.cwd(),'content-scripts/text-injection-all-providers.js'),'utf8');
describe('acknowledged local edition protocol',()=>{
  let parent, original;
  beforeAll(()=>{
    original=window.parent;parent={postMessage:vi.fn()};
    Object.defineProperty(window,'parent',{configurable:true,value:parent});
    window.eval(source);
  });
  afterAll(()=>Object.defineProperty(window,'parent',{configurable:true,value:original}));
  beforeEach(()=>{
    window.happyDOM.setURL('https://chat.deepseek.com/');parent.postMessage.mockClear();
    document.body.innerHTML='<textarea id="editor" placeholder="Message DeepSeek"></textarea><div id="send" role="button" class="ds-button ds-button--primary ds-button--filled ds-button--circle"></div>';
    for(const element of document.querySelectorAll('textarea,[role="button"]'))Object.defineProperty(element,'offsetParent',{configurable:true,get:()=>document.body});
  });
  function message(data,sender=parent){window.dispatchEvent(new MessageEvent('message',{source:sender,data:{context:'multi-panel',requestId:'cn-test',...data}}));}
  it('confirms text fill without clicking send',()=>{
    const clicked=vi.fn();document.querySelector('#send').addEventListener('click',clicked);
    message({type:'PANELIZE_CN_FILL',text:'测试内容',images:[]});
    expect(document.querySelector('#editor').value).toBe('测试内容');expect(clicked).not.toHaveBeenCalled();
    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({action:'fill',status:'succeeded',requestId:'cn-test'}),'*');
  });
  it('confirms a real button click, without claiming an AI response',()=>{
    const clicked=vi.fn();document.querySelector('#send').addEventListener('click',clicked);
    message({type:'PANELIZE_CN_SUBMIT'});expect(clicked).toHaveBeenCalledOnce();
    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({action:'send',status:'succeeded'}),'*');
  });
  it('reports an unavailable send button as a failure',()=>{
    document.querySelector('#send').classList.add('ds-button--disabled');message({type:'PANELIZE_CN_SUBMIT'});
    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({action:'send',status:'failed',reason:'control-not-found'}),'*');
  });
  it('rejects actions from another frame or the wrong context',()=>{
    message({type:'PANELIZE_CN_FILL',text:'bad',images:[]},{});
    message({type:'PANELIZE_CN_FILL',context:'other',text:'bad',images:[]});
    expect(document.querySelector('#editor').value).toBe('');expect(parent.postMessage).not.toHaveBeenCalled();
  });
});
