import { selectStartupPanels } from '../modules/panel-startup.js';
describe('explicit panel startup', () => {
  const available = ['chatgpt', 'deepseek', 'doubao', 'kimi'];
  it('opens two domestic platforms on first use', () => {
    expect(selectStartupPanels(undefined, available, 8)).toEqual(['deepseek', 'doubao']);
  });
  it('restores a user choice despite a different enabled provider order', () => {
    expect(selectStartupPanels(['kimi', 'deepseek'], available, 8)).toEqual(['kimi', 'deepseek']);
  });
  it('keeps a deliberately added third platform on restart', () => {
    expect(selectStartupPanels(['deepseek','doubao','kimi'], available, 8)).toEqual(['deepseek','doubao','kimi']);
  });
  it('ignores duplicates and inaccessible providers and respects the limit', () => {
    expect(selectStartupPanels(['missing','kimi','kimi','deepseek'], available, 1)).toEqual(['kimi']);
  });
  it('falls back safely when all previous providers are unavailable', () => {
    expect(selectStartupPanels(['missing'], available, 8)).toEqual(['chatgpt', 'deepseek']);
    expect(selectStartupPanels(undefined, [], 8)).toEqual([]);
  });
});
