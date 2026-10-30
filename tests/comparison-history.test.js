import {mergeComparisonHistory} from '../modules/comparison-history.js';
const entry=(question)=>({id:'old',savedAt:123,question,sources:[{name:'A',text:'甲'},{name:'B',text:'乙'}],result:{topic:'主题',differences:[],summary:'总结'}});
describe('comparison backup merge',()=>{
  it('keeps existing records and deduplicates repeated backups',()=>{
    const a=entry('问题一'),b=entry('问题二');
    const merged=mergeComparisonHistory([a],[a,b]);
    expect(merged.map(e=>e.question)).toEqual(['问题一','问题二']);
    expect(new Set(merged.map(e=>e.id)).size).toBe(2);
    expect(mergeComparisonHistory(merged,[a,b])).toHaveLength(2);
  });
  it('rejects malformed records and overflow instead of discarding data',()=>{
    expect(()=>mergeComparisonHistory([], [{}])).toThrow('不完整');
    expect(()=>mergeComparisonHistory([],Array.from({length:101},(_,i)=>entry(String(i))))).toThrow('超过100条');
  });
});
