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
