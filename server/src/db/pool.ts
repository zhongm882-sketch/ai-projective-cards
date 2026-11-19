import pg from 'pg';
import { env } from '../env.js';

/**
 * PostgreSQL 连接池。
 *
 * 托管数据库（Neon / Supabase）几乎都要求 TLS，但它们的证书链在容器里
 * 常常验证不过。这里对非本地地址启用 SSL 但不强制校验证书——
 * 传输仍然是加密的，且真正敏感的字段在应用层已经加密过一次。
 */

const isLocal = /localhost|127\.0\.0\.1|@postgres[:/]|host\.docker\.internal/.test(env.DATABASE_URL);

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// 连接池里的空闲连接如果被数据库单方面掐断，会以 error 事件冒出来。
// 不监听会让整个进程崩掉。
pool.on('error', (err) => {
  console.error('[db] 空闲连接异常：', err.message);
});

/** 便捷查询。返回行数组。 */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query<T>(sql, params);
  return result.rows;
}

/** 取一行，没有则返回 null。 */
export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * 在一个事务里执行。回调抛错会自动回滚。
 * 「注册并迁移游客数据」这类多表写入必须用它——中途失败会留下半迁移状态。
 */
export async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
