/**
 * 进程内滑动窗口限流。
 *
 * 用途：保护「服务端自带 API Key」这条路径。身份校验让请求可归因，
 * 但可归因不等于有节制——一个游客身份也可以循环发一千次请求把额度烧光。
 *
 * 为什么不用现成的库：这里要拦的是 AI 调用（每次几秒、成本以分计），
 * 量级极小，一个 Map 就够。真正的分布式限流在后端（@fastify/rate-limit）。
 *
 * 已知局限：状态在进程内存里。多实例部署时每个实例各有一份配额，
 * 实际上限 = 配置值 × 实例数。这是个近似值，用来挡住「脚本循环刷」，
 * 不是精确计费。要精确就得把计数挪到后端或 Redis。
 */

interface Bucket {
  /** 窗口内的请求时间戳（毫秒） */
  hits: number[];
}

const buckets = new Map<string, Bucket>();

/** 上次清理时间。避免每次调用都全表扫描。 */
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 60_000;

/**
 * 清掉已经完全过期的 key。
 *
 * 不做这一步的话，每个短命的游客身份都会在 Map 里留一条永久记录——
 * 一个慢速内存泄漏，跑几个月就能吃掉几百 MB。
 */
function sweep(windowMs: number, now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;

  for (const [key, entry] of buckets) {
    const alive = entry.hits.filter((t) => now - t < windowMs);
    if (alive.length === 0) buckets.delete(key);
    else entry.hits = alive;
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** 窗口内还剩多少次 */
  remaining: number;
  /** 还要等多少秒才能再试（allowed 为 false 时才有意义） */
  retryAfterSeconds: number;
}

/**
 * 消耗一次配额。
 *
 * @param key      限流维度。传身份标识而不是 IP——同一个 WiFi 下的人不该互相挤占。
 * @param max      窗口内允许的次数
 * @param windowMs 窗口长度
 */
export function consume(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(windowMs, now);

  const entry = buckets.get(key) ?? { hits: [] };
  // 只保留还在窗口内的记录，滑动窗口就是这么实现的
  entry.hits = entry.hits.filter((t) => now - t < windowMs);

  if (entry.hits.length >= max) {
    buckets.set(key, entry);
    const oldest = entry.hits[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      // 最早那次请求滑出窗口的时刻，就是下一次可用的时刻
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  entry.hits.push(now);
  buckets.set(key, entry);

  return {
    allowed: true,
    remaining: max - entry.hits.length,
    retryAfterSeconds: 0,
  };
}

/** 仅供测试：清空全部计数。 */
export function resetRateLimits(): void {
  buckets.clear();
  lastSweep = Date.now();
}
