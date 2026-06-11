import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ocHealth, createSession, sendMessage, deleteSession } from '../server/lib/opencode.mjs';

const up = await ocHealth();
const maybe = up ? test : test.skip;
if (!up) console.log('opencode serve 未运行，跳过集成测试');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-it-'));

maybe('能创建 session、写文件、删 session', async () => {
  const sid = await createSession(dir, 'it');
  assert.match(sid, /^ses_/);
  const r = await sendMessage(sid, dir, { text: '在当前目录创建 t.html：<!DOCTYPE html><html><body>ok</body></html>。只创建这一个文件。' });
  assert.ok(r.info);
  assert.ok(fs.existsSync(path.join(dir, 't.html')), 'agent 应写出 t.html');
  await deleteSession(sid, dir);
}, { timeout: 120000 });
