import { test, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeStore } from '../server/lib/store.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xbstore-'));
const store = makeStore(dir);
afterEach(() => { for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f)); });

test('set 后 get 取回', async () => {
  await store.op('app:notes', { op: 'set', key: 'a', value: { x: 1 } });
  assert.deepStrictEqual(await store.op('app:notes', { op: 'get', key: 'a' }), { x: 1 });
});

test('不同 appId 数据隔离', async () => {
  await store.op('slug:aaa', { op: 'set', key: 'k', value: 'A' });
  await store.op('slug:bbb', { op: 'set', key: 'k', value: 'B' });
  assert.strictEqual(await store.op('slug:aaa', { op: 'get', key: 'k' }), 'A');
  assert.strictEqual(await store.op('slug:bbb', { op: 'get', key: 'k' }), 'B');
});

test('keys 列出键，del 删除', async () => {
  await store.op('x', { op: 'set', key: 'a', value: 1 });
  await store.op('x', { op: 'set', key: 'b', value: 2 });
  assert.deepStrictEqual((await store.op('x', { op: 'keys' })).sort(), ['a', 'b']);
  await store.op('x', { op: 'del', key: 'a' });
  assert.deepStrictEqual(await store.op('x', { op: 'keys' }), ['b']);
});

test('超大 value 被拒', async () => {
  await assert.rejects(() => store.op('x', { op: 'set', key: 'big', value: 'z'.repeat(70000) }), /过大|超出/);
});

test('appId 路径穿越被消毒', async () => {
  await store.op('../../etc/passwd', { op: 'set', key: 'k', value: 1 });
  for (const f of fs.readdirSync(dir)) assert.ok(!f.includes('..'), '文件名不应含 ..');
  assert.ok(!fs.existsSync(path.join(dir, '..', '..', 'etc')), '不应写出目录外');
});

test('并发 set 不丢数据', async () => {
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.op('c', { op: 'set', key: 'k' + i, value: i })));
  assert.strictEqual((await store.op('c', { op: 'keys' })).length, 20);
});
