import { selectedPanels, orderProviders, executePanels, canRetry } from '../modules/cn-workflow.js';
describe('Chinese selected platform workflow', () => {
  const panels=[{id:'one',providerId:'deepseek'},{id:'two',providerId:'doubao'}];
  it('excludes unchecked platforms and defaults new platforms to selected',()=>{
    expect(selectedPanels(panels,{deepseek:false})).toEqual([panels[1]]);
    expect(selectedPanels(panels,{deepseek:false,doubao:false})).toEqual([]);
  });
  it('orders recent providers before domestic providers without mutating the catalog',()=>{
    const list=['chatgpt','doubao','qwen-cn','kimi'].map(id=>({id}));
    expect(orderProviders(list,['kimi']).map(p=>p.id)).toEqual(['kimi','doubao','qwen-cn','chatgpt']);
    expect(list[0].id).toBe('chatgpt');
  });
  it('never clicks send after a failed fill',async()=>{
    const send=vi.fn();
    const results=await executePanels({panels,text:'test',images:[],submit:true,fill:async()=>({ok:false,reason:'control-not-found'}),send,status:vi.fn()});
    expect(send).not.toHaveBeenCalled();expect(results.every(canRetry)).toBe(true);
  });
  it('waits for each fill before sending, and fill-only never submits',async()=>{
    const events=[];
    const options={panels,text:'test',images:[],fill:async p=>{events.push('fill-'+p.id);return {ok:true};},send:async p=>{events.push('send-'+p.id);return {ok:true};},status:vi.fn()};
    await executePanels({...options,submit:false});expect(events).toEqual(['fill-one','fill-two']);
    events.length=0;await executePanels({...options,submit:true});
    expect(events.indexOf('send-one')).toBeGreaterThan(events.indexOf('fill-one'));
  });
  it('does not offer retry for an ambiguous send timeout or exception',()=>{
    expect(canRetry({ok:false,phase:'send',reason:'preview-timeout'})).toBe(false);
    expect(canRetry({ok:false,phase:'send',reason:'injection-error'})).toBe(false);
    expect(canRetry({ok:false,phase:'send',reason:'control-not-found'})).toBe(true);
  });
  it('isolates a provider error so another provider can complete',async()=>{
    const results=await executePanels({panels,text:'test',images:[],submit:true,fill:async p=>{if(p.id==='one')throw Error();return {ok:true};},send:async()=>({ok:true}),status:vi.fn()});
    expect(results.map(r=>r.ok)).toEqual([false,true]);
  });
});
