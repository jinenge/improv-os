import { test } from 'node:test';
import assert from 'node:assert';
import { mapEvent } from '../server/lib/agent-events.mjs';

const SID = 'ses_abc';

test('工具 running → stage 事件带中文标签', () => {
  const e = mapEvent({ type: 'message.part.updated', properties: { part: { sessionID: SID, type: 'tool', tool: 'edit', state: { status: 'running' } } } }, SID);
  assert.strictEqual(e.event, 'stage');
  assert.match(e.data.label, /编辑/);
});

test('工具 completed → 忽略（返回 null，避免噪声）', () => {
  const e = mapEvent({ type: 'message.part.updated', properties: { part: { sessionID: SID, type: 'tool', tool: 'edit', state: { status: 'completed' } } } }, SID);
  assert.strictEqual(e, null);
});

test('session.idle → agentdone', () => {
  const e = mapEvent({ type: 'session.idle', properties: { sessionID: SID } }, SID);
  assert.strictEqual(e.event, 'agentdone');
});

test('别的 session 的事件被忽略', () => {
  const e = mapEvent({ type: 'message.part.updated', properties: { part: { sessionID: 'ses_other', type: 'tool', tool: 'edit', state: { status: 'running' } } } }, SID);
  assert.strictEqual(e, null);
});

test('文本 part 被忽略（不直播累积全文）', () => {
  const e = mapEvent({ type: 'message.part.updated', properties: { part: { sessionID: SID, type: 'text', text: '我来分析一下' } } }, SID);
  assert.strictEqual(e, null);
});

test('session.error → error 事件', () => {
  const e = mapEvent({ type: 'session.error', properties: { sessionID: SID, error: {} } }, SID);
  assert.strictEqual(e.event, 'error');
});
