import { test } from 'node:test';
import assert from 'node:assert';
import { clientIp, makeOriginGuard } from '../server/lib/origin.mjs';

test('clientIp 优先 cf-connecting-ip（Cloudflare 不可伪造）', () => {
  assert.strictEqual(
    clientIp({ headers: { 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9, 8.8.8.8' }, socket: { remoteAddress: '7.7.7.7' } }),
    '1.2.3.4');
});

test('clientIp 无 cf 时取 x-forwarded-for 末段（防伪造首段绕限流）', () => {
  assert.strictEqual(
    clientIp({ headers: { 'x-forwarded-for': 'fake.attacker, 5.6.7.8' }, socket: {} }),
    '5.6.7.8');
});

test('clientIp 兜底 socket.remoteAddress', () => {
  assert.strictEqual(clientIp({ headers: {}, socket: { remoteAddress: '7.7.7.7' } }), '7.7.7.7');
});

const guard = makeOriginGuard();

test('合法 Origin 放行', () => {
  assert.strictEqual(guard({ headers: { origin: 'https://os.fzhiyu.dev' } }), true);
});

test('非法 Origin 拒（跨站盗用）', () => {
  assert.strictEqual(guard({ headers: { origin: 'https://evil.example.com' } }), false);
});

test('无 Origin 但有合法 Referer 放行（同源 GET / SSE）', () => {
  assert.strictEqual(guard({ headers: { referer: 'https://os.fzhiyu.dev/' } }), true);
});

test('无 Origin、Referer 非法 → 拒', () => {
  assert.strictEqual(guard({ headers: { referer: 'https://evil.example.com/x' } }), false);
});

test('裸请求（无 Origin 无 Referer）→ 拒', () => {
  assert.strictEqual(guard({ headers: {} }), false);
});

test('Origin 优先于 Referer：Origin 非法即拒，哪怕 Referer 合法', () => {
  assert.strictEqual(guard({ headers: { origin: 'https://evil.example.com', referer: 'https://os.fzhiyu.dev/' } }), false);
});

test('本地开发 localhost / 127.0.0.1 放行', () => {
  assert.strictEqual(guard({ headers: { origin: 'http://localhost:7100' } }), true);
  assert.strictEqual(guard({ headers: { referer: 'http://127.0.0.1:7100/' } }), true);
});

test('畸形 Origin 字符串 → 拒（不抛异常）', () => {
  assert.strictEqual(guard({ headers: { origin: 'not a url' } }), false);
});

test('ALLOWED_ORIGINS 扩展生效', () => {
  const g = makeOriginGuard(['demo.example.com']);
  assert.strictEqual(g({ headers: { origin: 'https://demo.example.com' } }), true);
});

// ===== isLan：内网直连判定（限制外网、放开内网的依据）=====
import { isLan } from '../server/lib/origin.mjs';

test('isLan: 私网地址直连 → 内网（10/172.16-31/192.168/链路本地）', () => {
  for (const a of ['10.60.0.7', '172.16.0.1', '172.31.255.1', '192.168.1.5', '169.254.0.3'])
    assert.strictEqual(isLan({ headers: {}, socket: { remoteAddress: a } }), true, a);
});

test('isLan: 回环与 IPv6 映射私网 → 内网', () => {
  for (const a of ['127.0.0.1', '::1', '::ffff:10.0.80.2', '::ffff:127.0.0.1', 'fd00::1', 'fe80::abcd'])
    assert.strictEqual(isLan({ headers: {}, socket: { remoteAddress: a } }), true, a);
});

test('isLan: 带 cf-connecting-ip 一律算公网（即使 socket 是回环——cloudflared 本机回连）', () => {
  assert.strictEqual(isLan({ headers: { 'cf-connecting-ip': '1.2.3.4' }, socket: { remoteAddress: '127.0.0.1' } }), false);
});

test('isLan: 公网 socket 地址 → 公网；172.32 不是私网', () => {
  for (const a of ['8.8.8.8', '203.0.113.9', '172.32.0.1', '2001:db8::1'])
    assert.strictEqual(isLan({ headers: {}, socket: { remoteAddress: a } }), false, a);
});

test('isLan: 内网者伪造 cf 头只会降级成公网待遇（无提权方向）', () => {
  assert.strictEqual(isLan({ headers: { 'cf-connecting-ip': '10.0.0.9' }, socket: { remoteAddress: '10.0.0.9' } }), false);
});
