import {personalPrompts} from '../modules/my-prompts.js';
describe('personal prompt collection',()=>{
  it('hides unchanged bundled prompts and preserves user edits and custom Chinese prompts',()=>{
    const preset={title:'Example',content:'English example'};
    const edited={...preset,content:'用户修改的内容'};
    const custom={title:'选题',content:'请帮我分析{主题}'};
    expect(personalPrompts([preset,edited,custom],[preset])).toEqual([edited,custom]);
  });
  it('preserves explicitly saved personal prompts even when they match a bundled example',()=>{
    const preset={title:'Example',content:'English example'};
    const saved={...preset,isPersonal:true};
    expect(personalPrompts([saved],[preset])).toEqual([saved]);
  });
});
