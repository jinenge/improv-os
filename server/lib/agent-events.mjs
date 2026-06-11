// 把 openCode serve 的事件映射成现有剧场 SSE 事件。纯函数，可单测。
// 只直播工具阶段（read/edit/write/bash...）+ 完成/出错信号；文本 part 不直播（part.text 是累积全文会重复刷屏）。
const TOOL_LABEL = {
  read: '正在阅读代码', edit: '正在编辑文件', write: '正在写入文件', patch: '正在修改代码',
  bash: '正在运行验证', grep: '正在检索代码', glob: '正在查找文件', list: '正在浏览目录',
  webfetch: '正在查阅资料', todowrite: '正在规划步骤', todoread: '正在规划步骤',
};

export function mapEvent(oc, sessionID) {
  if (!oc || !oc.type) return null;
  const p = oc.properties || {};
  if (oc.type === 'session.idle' && p.sessionID === sessionID) return { event: 'agentdone', data: {} };
  if (oc.type === 'session.error' && (p.sessionID === sessionID || !p.sessionID)) return { event: 'error', data: { message: '智能体运行出错' } };
  if (oc.type !== 'message.part.updated') return null;
  const part = p.part;
  if (!part || part.sessionID !== sessionID) return null;
  if (part.type === 'tool') {
    const status = part.state?.status;
    if (status === 'running' || status === 'pending') {
      return { event: 'stage', data: { name: part.tool, label: TOOL_LABEL[part.tool] || '正在处理' } };
    }
    return null;
  }
  return null; // 文本 / reasoning / step-start 都不直播
}
