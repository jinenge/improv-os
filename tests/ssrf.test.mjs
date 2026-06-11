import { test } from 'node:test';
import assert from 'node:assert';
import { isBlockedIp, validateUrl, safeGet } from '../server/lib/ssrf.mjs';

test('私有/保留 IPv4 被拦', () => {
  for (const ip of ['10.0.80.1', '172.16.0.1', '192.168.1.1', '127.0.0.1', '169.254.169.254', '0.0.0.0', '100.64.0.1']) {
    assert.strictEqual(isBlockedIp(ip), true, `${ip} 应被拦`);
  }
});

test('公网 IPv4 放行', () => {
  for (const ip of ['1.1.1.1', '8.8.8.8', '93.184.216.34']) {
    assert.strictEqual(isBlockedIp(ip), false, `${ip} 应放行`);
  }
});

test('IPv6 环回/链路本地/唯一本地 被拦', () => {
  for (const ip of ['::1', 'fe80::1', 'fc00::1', '::ffff:10.0.0.1']) {
    assert.strictEqual(isBlockedIp(ip), true, `${ip} 应被拦`);
  }
});

test('非 http(s) 协议被拒', async () => {
  for (const u of ['file:///etc/passwd', 'gopher://x', 'ftp://x', 'data:text/html,x']) {
    await assert.rejects(() => validateUrl(u), /协议/);
  }
});

test('解析到私有 IP 的域名被拒', async () => {
  await assert.rejects(() => validateUrl('http://localhost:7100/'), /内网|私有|禁止/);
});

test('合法公网 URL 通过校验并返回解析 IP', async () => {
  const r = await validateUrl('https://1.1.1.1/');
  assert.ok(r.ip, '应返回连接用 IP');
  assert.strictEqual(r.hostname, '1.1.1.1');
});

test('safeGet 拒绝内网地址', async () => {
  await assert.rejects(() => safeGet('http://127.0.0.1:7100/'), /内网|私有/);
});
