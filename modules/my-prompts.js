// Preserve the old database while hiding unchanged bundled examples.
export function personalPrompts(prompts, bundled) {
  const key=p=>JSON.stringify([p.title?.trim(),p.content?.trim()]);
  const defaults=new Set(bundled.map(key));
  return prompts.filter(p=>p.isPersonal || !defaults.has(key(p)));
}
let bundled;
export async function getPersonalPrompts(getAll) {
  bundled ??= Promise.all(['default-prompts.json','default-prompts-zh_CN.json'].map(async name=>{
    const response=await fetch(chrome.runtime.getURL(`data/prompt-libraries/${name}`));
    if(!response.ok)throw new Error('无法读取收藏配置，请重试');
    const data=await response.json();return Array.isArray(data)?data:data.prompts;
  })).then(lists=>lists.flat()).catch(error=>{bundled=null;throw error;});
  return personalPrompts(await getAll(),await bundled);
}
