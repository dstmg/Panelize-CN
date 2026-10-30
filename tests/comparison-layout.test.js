import { initializeComparison } from '../modules/comparison-ui.js';
describe('differences first comparison layout',()=>{
  it('groups differences by model, hides shared sections and puts the answer last',async()=>{
    document.body.innerHTML='<div class="toolbar-right"><button id="share-snapshot-btn"><span class="btn-text">分享</span></button></div>';
    const panels=[{id:'a',providerId:'a'},{id:'b',providerId:'b'}];
    const saved={timestamp:Date.now(),rows:[{name:'A',text:'先验证流量'},{name:'B',text:'先验证价格'}],resultSources:['A','B'],result:{topic:'诊断',summary:'保持价格，先查流量来源。',agreements:['共同废话'],checks:[{issue:'冗余区块'}],differences:[{dimension:'优先动作',views:[{source:'S1',claim:'先验证流量',quote:'先验证流量'},{source:'S2',claim:'先验证价格',quote:'先验证价格'}]}]}};
    chrome.storage.local.get.mockResolvedValue({cnComparisonDraftOnUpgrade:saved});
    const scroll=vi.spyOn(Element.prototype,'scrollIntoView').mockImplementation(()=>{});
    const fill=vi.fn();initializeComparison({getPanels:()=>panels,name:p=>p.providerId.toUpperCase(),question:()=>'',fill});
    document.querySelector('#compare-answers-btn').click();
    await vi.waitFor(()=>expect(document.querySelectorAll('.compare-model-card')).toHaveLength(2));
    expect([...document.querySelectorAll('.compare-model-card h3')].map(e=>e.textContent)).toEqual(['A','B']);
    expect(document.querySelector('.compare-model-card ol li').textContent).toContain('优先动作：先验证流量');
    expect(document.querySelector('#compare-result').textContent).not.toContain('共同废话');
    expect(document.querySelector('#compare-result table')).toBeNull();
    expect(document.querySelector('#compare-setup').open).toBe(false);
    expect([...document.querySelectorAll('.compare-evidence')].every(e=>!e.open)).toBe(true);
    const final=document.querySelector('.compare-final-answer');expect(final.querySelector('h2').textContent).toBe('综合回答');expect(final.textContent).toContain('保持价格');
    expect(document.querySelector('.compare-model-cards').nextElementSibling).toBe(final);
    expect(fill).not.toHaveBeenCalled();
    await new Promise(resolve=>setTimeout(resolve,40));scroll.mockRestore();
  });
});
