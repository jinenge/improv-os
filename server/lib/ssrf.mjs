// SSRF 防护：http 能力的唯一防线。私有网段黑名单 + 协议白名单 + DNS 校验 + rebinding 防护
import dns from 'node:dns/promises';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';

// IPv4 转 32 位整数
function ipv4ToInt(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => n < 0 || n > 255 || Number.isNaN(n))) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}
const V4_BLOCKS = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
].map(([base, bits]) => ({ base: ipv4ToInt(base), mask: bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0 }));

export function isBlockedIp(ip) {
  // IPv4-mapped IPv6 → 取出 IPv4
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (m) ip = m[1];
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    if (n === null) return true;
    return V4_BLOCKS.some(b => ((n & b.mask) >>> 0) === ((b.base & b.mask) >>> 0));
  }
  if (net.isIPv6(ip)) {
    const lo = ip.toLowerCase();
    if (lo === '::1' || lo === '::') return true;
    if (lo.startsWith('fe8') || lo.startsWith('fe9') || lo.startsWith('fea') || lo.startsWith('feb')) return true; // fe80::/10
    if (lo.startsWith('fc') || lo.startsWith('fd')) return true; // fc00::/7
    return false;
  }
  return true; // 无法识别一律拦
}

// 校验 URL：协议白名单 + DNS 解析后所有 IP 都不在黑名单。返回 {hostname, ip, port, protocol, href}
export async function validateUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('URL 格式无效'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('仅允许 http/https 协议');
  const host = u.hostname.replace(/^\[|\]$/g, ''); // IPv6 字面量去括号
  let ips;
  if (net.isIP(host)) ips = [host];
  else {
    try { ips = (await dns.lookup(host, { all: true })).map(a => a.address); }
    catch { throw new Error('域名解析失败'); }
  }
  if (!ips.length) throw new Error('域名解析失败');
  for (const ip of ips) if (isBlockedIp(ip)) throw new Error('禁止访问内网/私有地址');
  return { hostname: host, ip: ips[0], port: u.port, protocol: u.protocol, href: u.href };
}

const MAX_BYTES = 512 * 1024;
const TIMEOUT = 8000; // wttr.in 等公共源偶发 >5s，放宽容错；SDK 侧总超时 20s
const MAX_REDIRECTS = 3;

export async function safeGet(rawUrl, redirectsLeft = MAX_REDIRECTS) {
  const v = await validateUrl(rawUrl); // 每跳都重新校验，防 rebinding/重定向到内网
  const mod = v.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(v.href, {
      method: 'GET',
      // 固定连接 IP（用解析得到的合法 IP），避免解析-连接之间 DNS 被掉包
      // Node 20+ autoSelectFamily 会以 all:true 调用 lookup，期望数组返回
      lookup: (hostname, opts, cb) => {
        const fam = net.isIPv6(v.ip) ? 6 : 4;
        if (opts && opts.all) cb(null, [{ address: v.ip, family: fam }]);
        else cb(null, v.ip, fam);
      },
      timeout: TIMEOUT,
      headers: { 'user-agent': 'ImprovOS/1.0', 'accept': '*/*' },
    }, res => {
      // 重定向：重新走 safeGet 校验目标
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.destroy();
        if (redirectsLeft <= 0) return reject(new Error('重定向次数过多'));
        const next = new URL(res.headers.location, v.href).href;
        return resolve(safeGet(next, redirectsLeft - 1));
      }
      let len = 0; const chunks = [];
      res.on('data', c => {
        len += c.length;
        if (len > MAX_BYTES) { res.destroy(); return; }
        chunks.push(c);
      });
      res.on('end', () => resolve({
        status: res.statusCode,
        contentType: res.headers['content-type'] || '',
        body: Buffer.concat(chunks).toString('utf8').slice(0, MAX_BYTES),
      }));
    });
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', e => reject(e));
    req.end();
  });
}
