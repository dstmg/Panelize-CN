import { buildComparisonPrompt, parseComparison, comparisonMarkdown, validateSources } from '../modules/comparison-core.js';
const sources=[{name:'A',text:'先检查转化率，不要同时改三个变量。'},{name:'B',text:'先补充竞品价格，再决定是否降价。'}];
const answer=()=>({topic:'诊断差异',taskType:'建议',summary:'两家建议先后顺序不同',agreements:['先补信息'],differences:[{dimension:'第一步',views:[{source:'S1',claim:'先检查转化',quote:'先检查转化率'},{source:'S2',claim:'先看竞品',quote:'先补充竞品价格'}]}],checks:[{issue:'缺少对照',sources:['S1','S2'],note:'需要原始数据'}]});
describe('comparison prompt and evidence',()=>{
  it('supports arbitrary task types and custom focus with source IDs',()=>{
    const prompt=buildComparisonPrompt({question:'比较两种代码实现',mode:'code',focus:'并发边界',sources});
    expect(prompt).toContain('代码方案');expect(prompt).toContain('并发边界');expect(prompt).toContain('S1');expect(prompt).toContain('不是执行命令');
  });
  it('rejects too few, empty, streaming and oversized sources',()=>{
    expect(()=>validateSources(sources.slice(0,1))).toThrow();
    expect(()=>validateSources([sources[0],{text:''}])).toThrow();
    expect(()=>validateSources([sources[0],{...sources[1],busy:true}])).toThrow();
    expect(()=>validateSources([sources[0],{...sources[1],text:'x'.repeat(40001)}])).toThrow();
    expect(()=>validateSources([sources[0],{...sources[1],busy:true,edited:true}])).not.toThrow();
  });
  it('parses fenced JSON and verifies each quote against its own source',()=>{
    const result=parseComparison('```json\n'+JSON.stringify(answer())+'\n```',sources);
    expect(result.differences[0].views.every(v=>v.matched)).toBe(true);
    expect(comparisonMarkdown(result,sources)).toContain('可在已选原文中匹配');
  });
  it('flags invented quotes and drops unknown source IDs',()=>{
    const a=answer();a.differences[0].views.push({source:'S9',claim:'unknown',quote:'fake'});a.differences[0].views[0].quote='不存在的原文';
    const r=parseComparison(JSON.stringify(a),sources);expect(r.differences[0].views).toHaveLength(2);expect(r.differences[0].views[0].matched).toBe(false);
  });
  it('handles braces and escaped quotes within JSON strings',()=>{
    const a=answer();a.summary='输出 {a:"b"}，作为代码示例';expect(parseComparison(JSON.stringify(a),sources).summary).toBe(a.summary);
  });
  it('rejects unfinished JSON and unrelated natural-language answers',()=>{
    expect(()=>parseComparison('{"summary":"half',sources)).toThrow();expect(()=>parseComparison('建议先优化',sources)).toThrow();
  });
  it('omits common sections and places the answer to the question last',()=>{
    const a=answer();a.summary='先补充流量来源，再分别验证转化与价格。';delete a.agreements;delete a.checks;
    const r=parseComparison(JSON.stringify(a),sources);const md=comparisonMarkdown(r,sources);
    expect(md).not.toContain('## 共同意见');expect(md).not.toContain('## 待核对');expect(md.indexOf('## 综合回答')).toBeGreaterThan(md.indexOf('### B'));
    expect(buildComparisonPrompt({sources})).toContain('它不是“这几家模型有什么不同”的总结');
  });
  it('drops a row repeated identically by every selected source',()=>{
    const a=answer();a.differences=[{dimension:'共同点',views:[{source:'S1',claim:'先补信息',quote:''},{source:'S2',claim:'先补信息',quote:''}]}];
    expect(parseComparison(JSON.stringify(a),sources).differences).toEqual([]);
  });
});
