// 共享 KV：按 appId 命名空间隔离的文件存储（同一 appId = 所有访客共享一份数据）
import fs from 'node:fs';
import path from 'node:path';

const MAX_VALUE = 64 * 1024;
const MAX_TOTAL = 1024 * 1024;
const MAX_KEYS = 100;
const MAX_KEYLEN = 128;

export function makeStore(dir, { block } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const chains = new Map(); // appId -> Promise（按 appId 串行化读改写，避免并发丢写）
  const safeId = id => String(id).replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 80);
  const fileOf = id => path.join(dir, safeId(id) + '.json');
  const read = id => { try { return JSON.parse(fs.readFileSync(fileOf(id), 'utf8')); } catch { return {}; } };
  const write = (id, obj) => {
    const tmp = fileOf(id) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj));
    fs.renameSync(tmp, fileOf(id));
  };

  function run(appId, { op, key, value }) {
    const data = read(appId);
    if (op === 'get') return data[key];
    if (op === 'keys') return Object.keys(data);
    if (op === 'del') { delete data[key]; write(appId, data); return true; }
    if (op === 'set') {
      if (typeof key !== 'string' || !key || key.length > MAX_KEYLEN) throw new Error('键名无效');
      const ser = JSON.stringify(value ?? null);
      if (ser.length > MAX_VALUE) throw new Error('数据过大（单条上限 64KB）');
      if (block && block(ser)) throw new Error('内容不符合规范');
      if (!(key in data) && Object.keys(data).length >= MAX_KEYS) throw new Error('键数超出上限');
      data[key] = value;
      if (JSON.stringify(data).length > MAX_TOTAL) throw new Error('数据总量超出上限（1MB）');
      write(appId, data);
      return true;
    }
    throw new Error('未知操作');
  }

  return {
    op(appId, args) {
      const id = safeId(appId);
      const prev = chains.get(id) || Promise.resolve();
      const next = prev.then(() => run(id, args), () => run(id, args));
      chains.set(id, next.catch(() => {}));
      return next;
    },
  };
}
