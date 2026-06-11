// 并发闸：最多 max 个任务并发，其余排队（队列上限 maxQueue，满了 run() 立即拒绝并标记 busy）。
// run(fn) 返回 fn 的结果（fn 可 async）。maxQueue 默认无限（向后兼容）。
export function makeGate(max = 1, maxQueue = Infinity) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve().then(fn).then(resolve, reject).finally(() => { active--; next(); });
  };
  return {
    run(fn) {
      return new Promise((resolve, reject) => {
        if (queue.length >= maxQueue) return reject(Object.assign(new Error('服务繁忙'), { busy: true }));
        queue.push({ fn, resolve, reject });
        next();
      });
    },
    get pending() { return queue.length; },
    get active() { return active; },
  };
}
