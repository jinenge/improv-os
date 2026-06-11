// .env 注入。必须作为 index.mjs 的第一个 import——ES import 全部提升到模块体之前求值，
// 任何在模块层读 process.env 的库（如 opencode.mjs 的 OC_*）都依赖本文件先执行。
// 教训（2026-06-12）：曾把 .env 加载写在 index.mjs 模块体里，导致 OC_PROVIDER 永远读默认值，
// 默认值改名后慢轨全断——侥幸正确 ≠ 正确。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const envFile = path.join(ROOT, '.env');
for (const line of (fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8').split('\n') : [])) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
