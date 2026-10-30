import { parseComparison } from './comparison-core.js';

export function mergeComparisonHistory(current, incoming) {
  if (!Array.isArray(current) || !Array.isArray(incoming)) throw Error('对比记录格式不正确');
  const result = [], seen = new Set();
  for (const entry of [...current, ...incoming]) {
    if (!entry || !Array.isArray(entry.sources) || entry.sources.length < 2 ||
        entry.sources.some(source => typeof source.name !== 'string' || typeof source.text !== 'string') ||
        !Number.isFinite(entry.savedAt)) throw Error('备份中的对比记录不完整');
    const parsed = parseComparison(JSON.stringify(entry.result), entry.sources);
    const key = JSON.stringify([entry.question || '', entry.sources, parsed]);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({id:crypto.randomUUID(), savedAt:entry.savedAt, question:String(entry.question || ''), topic:parsed.topic, sources:entry.sources.map(s=>({name:s.name,text:s.text})), result:parsed});
  }
  if (result.length > 100) throw Error('合并后超过100条对比记录，请先导出备份并清理部分记录');
  return result;
}
