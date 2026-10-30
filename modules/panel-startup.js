export const FIRST_OPEN_PANELS = ['deepseek', 'doubao'];

// Enabled providers are the catalog. Saved panels alone determine startup work.
export function selectStartupPanels(savedPanels, availableIds, maxPanels) {
  const available = new Set(availableIds);
  const saved = Array.isArray(savedPanels) ? savedPanels : FIRST_OPEN_PANELS;
  const selected = [...new Set(saved)].filter(id => available.has(id)).slice(0, maxPanels);
  return selected.length ? selected : [...available].slice(0, Math.min(2, maxPanels));
}
