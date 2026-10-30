import {parseComparison} from '../modules/comparison-core.js';
it('recovers unescaped excerpt quotes without losing the comparison envelope',()=>{
 const text='{"differences":[{"dimension":"主图","views":[{"source":"S1","claim":"主图作用","quote":"决定的是"点不点"，无法判断好坏"}]}],"summary":"先核对"}';
 const result=parseComparison(text,[{name:'A',text:'决定的是"点不点"，无法判断好坏'},{name:'B',text:'乙'}]);
 expect(result.differences[0].views[0].quote).toBe('决定的是"点不点"，无法判断好坏');
 expect(result.differences[0].views[0].matched).toBe(true);
 expect(result.summary).toBe('先核对');
});
