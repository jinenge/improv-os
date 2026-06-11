// 父窗口能力桥：生成应用 iframe → 这里 → 服务端 /api/capability/*
// 安全要点：只认登记过的 iframe.contentWindow（registry），忽略 iframe 自报的 appId。
const registry = new WeakMap(); // contentWindow -> appId（弱引用：iframe 销毁后自动回收）
const ALLOW = new Set(['ai', 'http', 'store']);

export function registerFrame(iframe, appId) {
  const w = iframe?.contentWindow;
  if (w) registry.set(w, appId);
}
export function unregisterFrame(iframe) {
  const w = iframe?.contentWindow;
  if (w) registry.delete(w);
}

// iframe 加载后告知 appId（SDK 在收到 init 前会缓存调用）
export function announce(iframe, appId) {
  const w = iframe?.contentWindow;
  if (w) w.postMessage({ __os: true, kind: 'init', appId }, '*');
}

async function handle(cap, method, args, appId) {
  if (cap === 'http' && method === 'get') {
    const r = await fetch('/api/capability/http?url=' + encodeURIComponent(String(args?.url || '')));
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || '请求失败');
    return body;
  }
  if (cap === 'store' && method === 'op') {
    const r = await fetch('/api/capability/store', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appId, op: args?.op, key: args?.key, value: args?.value }),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || '请求失败');
    return body.result;
  }
  if (cap === 'ai' && method === 'ask') {
    const r = await fetch('/api/capability/ai', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: String(args?.prompt || '').slice(0, 4000), appName: appId }),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || '请求失败');
    return body.text;
  }
  throw new Error('未知能力');
}

addEventListener('message', async e => {
  const d = e.data;
  if (!d || d.__os !== true || d.kind === 'init' || !d.id) return;
  const appId = registry.get(e.source);
  if (!appId) return;                       // 非白名单 iframe，忽略
  const reply = (ok, result, error) => { try { e.source.postMessage({ __os: true, id: d.id, ok, result, error }, '*'); } catch {} };
  if (!ALLOW.has(d.cap)) return reply(false, undefined, '未知能力');
  try {
    reply(true, await handle(d.cap, d.method, d.args, appId));
  } catch (err) {
    reply(false, undefined, err.message);
  }
});
