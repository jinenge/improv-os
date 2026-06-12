// 反盗用：同源校验 + 可信客户端 IP。零依赖，可单测。
// 背景：os.fzhiyu.dev 公开发布，烧 token 的接口若无来源校验，任何网站/脚本都能把它当免费 API（跨站 fetch、iframe 嵌入、裸脚本）。
// 经 Cloudflare 时 `cf-connecting-ip` 由边缘写入、客户端不可伪造，是限流应当采用的真实 IP（旧代码取 x-forwarded-for 首段，可被伪造绕过单 IP 限流）。

// 限流键：优先 Cloudflare 真实 IP；回退取 x-forwarded-for 末段（最接近源站、最难伪造）。
export function clientIp(req) {
  const h = (req && req.headers) || {};
  const cf = h['cf-connecting-ip'];
  if (cf) return String(cf).trim();
  const xff = h['x-forwarded-for'];
  if (xff) { const p = String(xff).split(','); return p[p.length - 1].trim(); }
  const xr = h['x-real-ip'];
  if (xr) return String(xr).trim();
  return String((req && req.socket && req.socket.remoteAddress) || '?');
}

// 内网直连判定：流量只有两条路进来——cloudflared 隧道（必带 cf-connecting-ip，边缘写入、客户端不可伪造）
// 或内网直连源站端口（源站不对公网暴露）。故「socket 是私网/回环地址 且 无 cf 头」⇒ 内网。
// 内网者伪造 cf 头只会把自己降级成公网待遇（限流更严），无提权方向，安全。
const PRIV4 = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/;
export function isLan(req) {
  if ((req && req.headers || {})['cf-connecting-ip']) return false;
  let a = String((req && req.socket && req.socket.remoteAddress) || '');
  if (a.startsWith('::ffff:')) a = a.slice(7);
  if (a === '::1') return true;
  if (PRIV4.test(a)) return true;
  if (/^(fc|fd|fe80)/i.test(a)) return true;
  return false;
}

function hostnameOf(v) { try { return new URL(v).hostname; } catch { return null; } }

// 返回 (req) => boolean。规则：
//  - 有 Origin → 其 hostname 必须命中白名单（跨站 fetch/POST 带 Origin，evil.com 在此被拒）
//  - 否则有 Referer → 看其 hostname（同源 GET 不发 Origin 但发 Referer，generate/capability.http 走这条）
//  - 两者皆无 → 拒（挡裸脚本/直连 curl；正常浏览器同源请求一定带其一）
export function makeOriginGuard(allowed) {
  const set = new Set(['os.fzhiyu.dev', 'localhost', '127.0.0.1', ...(allowed || []).filter(Boolean)]);
  return function originOk(req) {
    const h = (req && req.headers) || {};
    if (h.origin) { const x = hostnameOf(h.origin); return !!x && set.has(x); }
    if (h.referer) { const x = hostnameOf(h.referer); return !!x && set.has(x); }
    return false;
  };
}
