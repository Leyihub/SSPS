// 写飞书的单线程队列：同一个 Base 的写入必须串行（CLAUDE.md 平台约束）。
// 任务失败且可重试时按 2、4、8、16 秒退避重试，最多 4 次；每个任务之间留出最小间隔，避免触发限流。
export class RetryableError extends Error {
  constructor(msg: string, cause?: unknown) { super(msg); this.name = 'RetryableError'; this.cause = cause; }
}

export function createWriteQueue({ sleep = (ms) => new Promise((r) => setTimeout(r, ms)), minGapMs = 300, backoff = [2000, 4000, 8000, 16000] } = {}) {
  let tail = Promise.resolve(), pending = 0;
  async function run(task) {
    for (let attempt = 0; ; attempt++) {
      try { return await task(); }
      catch (e) {
        if (!(e instanceof RetryableError) || attempt >= backoff.length) throw e;
        await sleep(backoff[attempt]);
      }
    }
  }
  return {
    /** 把一个写任务排到队尾；返回该任务的结果。前一个任务失败不会影响后面的任务 */
    enqueue(task) {
      pending++;
      const p = tail.then(() => run(task)).finally(async () => { pending--; if (minGapMs) await sleep(minGapMs); });
      tail = p.catch(() => {});
      return p;
    },
    get size() { return pending; },
    idle: () => tail,
  };
}
