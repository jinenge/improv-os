import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SCRIPT = new URL('../server/verify-html.mjs', import.meta.url).pathname;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vh-'));
function run(html) {
  const f = path.join(dir, 'a.html');
  fs.writeFileSync(f, html);
  try { return { code: 0, out: execFileSync('node', [SCRIPT, f], { encoding: 'utf8' }) }; }
  catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}

test('合法 HTML 通过（exit 0 + OK）', () => {
  const r = run('<!DOCTYPE html><html><head></head><body><script>const x=1;</script></body></html>');
  assert.strictEqual(r.code, 0);
  assert.match(r.out, /OK/);
});

test('缺少结尾标签被报', () => {
  const r = run('<!DOCTYPE html><html><head></head><body>truncated');
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /结束|截断/);
});

test('script 语法错误被报', () => {
  const r = run('<!DOCTYPE html><html><body><script>const x = ;</script></body></html>');
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /语法/);
});

test('module/json script 不参与语法检查', () => {
  const r = run('<!DOCTYPE html><html><body><script type="application/json">{not:js}</script><script>const y=2;</script></body></html>');
  assert.strictEqual(r.code, 0);
});
