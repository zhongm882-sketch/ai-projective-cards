import { buildApp } from './app.js';
import { env } from './env.js';
import { runMigrations } from './db/migrate.js';
import { pruneExpiredTokens } from './auth/accounts.js';
import { closePool } from './db/pool.js';

/**
 * 启动入口。
 *
 * 启动时先跑迁移：表结构落后于代码会在第一次请求时才炸，
 * 那时排查成本高得多。宁可启动失败。
 */
async function main(): Promise<void> {
  await runMigrations();
  await pruneExpiredTokens();

  const app = await buildApp();

  // 优雅退出：先停止接收新请求，再关连接池。
  // 直接 process.exit() 会让进行中的事务留下半写状态。
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`收到 ${signal}，正在关闭…`);
    try {
      await app.close();
      await closePool();
      process.exit(0);
    } catch (err) {
      app.log.error({ err: err instanceof Error ? err.message : err }, '关闭时出错');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // 监听 0.0.0.0 而非默认的 localhost，否则在容器里外部访问不到。
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

main().catch(async (err) => {
  console.error('[server] 启动失败：', err instanceof Error ? err.message : err);
  await closePool().catch(() => {});
  process.exit(1);
});
