import { test } from 'node:test';
import assert from 'node:assert';
import { makeGate } from '../server/lib/gate.mjs';

test('限 1：任务串行执行，峰值并发不超过 1', async () => {
  const gate = makeGate(1);
  let active = 0, peak = 0;
  const job = () => new Promise(r => { active++; peak = Math.max(peak, active); setTimeout(() => { active--; r(); }, 30); });
  await Promise.all([gate.run(job), gate.run(job), gate.run(job)]);
  assert.strictEqual(peak, 1);
});

test('返回任务结果', async () => {
  const gate = makeGate(1);
  assert.strictEqual(await gate.run(() => 42), 42);
});

test('任务抛错不卡死后续', async () => {
  const gate = makeGate(1);
  await assert.rejects(() => gate.run(() => { throw new Error('boom'); }));
  assert.strictEqual(await gate.run(() => 'ok'), 'ok');
});

test('队列满时拒绝（busy 错误），不无限堆积', async () => {
  const gate = makeGate(1, 1);          // 并发 1，队列上限 1
  let release;
  const p1 = gate.run(() => new Promise(r => { release = r; }));  // 占用唯一并发槽
  const p2 = gate.run(() => Promise.resolve('queued'));            // 入队（queue=1，已满）
  await assert.rejects(() => gate.run(() => Promise.resolve()), e => e.busy === true);  // 超队列上限，拒绝
  release();
  await Promise.all([p1, p2]);
});

test('默认无队列上限（向后兼容）', async () => {
  const gate = makeGate(1);             // 不传 maxQueue
  const jobs = Array.from({ length: 50 }, (_, i) => gate.run(() => i));
  const r = await Promise.all(jobs);
  assert.strictEqual(r.length, 50);    // 全部入队执行，不拒绝
});
