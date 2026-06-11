#!/usr/bin/env node
// 给 openCode agent 用的 HTML 验证器：结构完整 + 每个 <script> 块语法可编译。
// 用法：node verify-html.mjs <file>。通过 → exit 0 打印 OK；有问题 → exit 1 列出问题。
import fs from 'node:fs';
import vm from 'node:vm';

const file = process.argv[2];
if (!file) { console.error('用法: node verify-html.mjs <file>'); process.exit(2); }
let html;
try { html = fs.readFileSync(file, 'utf8'); } catch { console.error('无法读取文件: ' + file); process.exit(2); }

const issues = [];
if (!/^\s*<!DOCTYPE/i.test(html)) issues.push('文档没有以 <!DOCTYPE html> 开头');
if (!/<\/html>\s*$/i.test(html)) issues.push('文档没有以 </html> 结束（可能被截断或不完整）');
const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(html))) {
  const attrs = m[1] || '', js = m[2];
  if (/type\s*=\s*["']?(module|application\/json|text\/template)/i.test(attrs)) continue;
  if (!js.trim()) continue;
  try { new vm.Script(js); } catch (e) { issues.push('脚本语法错误: ' + String(e.message).slice(0, 160)); }
}
if (issues.length) {
  console.log('发现 ' + issues.length + ' 个问题：');
  issues.forEach(i => console.log('- ' + i));
  process.exit(1);
}
console.log('OK');
process.exit(0);
