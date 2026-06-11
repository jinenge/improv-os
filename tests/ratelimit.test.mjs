import { test } from 'node:test';
import assert from 'node:assert';
import { makeLimiter } from '../server/lib/ratelimit.mjs';

test('滑动窗口：超过上限返回 false', () => {
  const lim = makeLimiter({ windowMs: 60000, max: 3 });
  assert.strictEqual(lim.check('ip1'), true);
  assert.strictEqual(lim.check('ip1'), true);
  assert.strictEqual(lim.check('ip1'), true);
  assert.strictEqual(lim.check('ip1'), false);
});

test('不同 key 独立计数', () => {
  const lim = makeLimiter({ windowMs: 60000, max: 1 });
  assert.strictEqual(lim.check('a'), true);
  assert.strictEqual(lim.check('b'), true);
});

test('窗口滑过后恢复', async () => {
  const lim = makeLimiter({ windowMs: 50, max: 1 });
  assert.strictEqual(lim.check('x'), true);
  assert.strictEqual(lim.check('x'), false);
  await new Promise(r => setTimeout(r, 60));
  assert.strictEqual(lim.check('x'), true);
});
