// 可复用滑动窗口限流器
export function makeLimiter({ windowMs, max }) {
  const hits = new Map(); // key -> number[]（时间戳）
  return {
    check(key) {
      const now = Date.now();
      const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
      if (arr.length >= max) { hits.set(key, arr); return false; }
      arr.push(now); hits.set(key, arr);
      return true;
    },
  };
}
