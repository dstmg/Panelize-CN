export function selectedPanels(panels, preferences) {
  return panels.filter(p => preferences[p.providerId] !== false);
}

export function orderProviders(providers, recent = []) {
  const domestic = ['deepseek', 'doubao', 'kimi', 'qwen-cn', 'yuanbao', 'chatglm'];
  const rank = id => recent.includes(id) ? recent.indexOf(id) :
    domestic.includes(id) ? recent.length + domestic.indexOf(id) : recent.length + domestic.length;
  return [...providers].sort((a, b) => rank(a.id) - rank(b.id));
}

// A submit timeout is ambiguous: never offer automatic resubmission.
export function canRetry(result) {
  return !result.ok && (result.phase === 'fill' || result.reason === 'control-not-found');
}

export async function executePanels({ panels, text, images, submit, fill, send, status }) {
  return Promise.all(panels.map(async panel => {
    let phase = 'fill';
    try {
      if (text.trim() || images.length) {
        status(panel, '正在填入');
        const result = await fill(panel, text, images);
        if (!result.ok) return { ...result, panelId: panel.id, phase };
      }
      if (!submit) {
        status(panel, '已填入');
        return { ok: true, panelId: panel.id, phase };
      }
      phase = 'send';
      status(panel, '正在确认发送按钮');
      const result = await send(panel);
      status(panel, result.ok ? '已点击发送' : result.reason === 'preview-timeout' ? '发送结果未确认，请查看网页' : '未找到可用发送按钮');
      return { ...result, panelId: panel.id, phase };
    } catch {
      return { ok: false, panelId: panel.id, reason: 'injection-error', phase };
    }
  }));
}
