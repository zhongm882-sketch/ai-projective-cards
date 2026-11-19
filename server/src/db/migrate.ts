import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pool, closePool } from './pool.js';

/**
 * 迁移运行器。
 *
 * 按文件名顺序执行 migrations/*.sql，已执行过的跳过。
 * 每个文件在一个事务里跑：中途失败会整体回滚，不会留下半套表结构。
 */

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedMigrations(): Promise<Set<string>> {
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  return new Set(rows.map((r) => r.name));
}

export async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await appliedMigrations();

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort(); // 001_、002_… 按名字排序即为执行顺序

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[migrate] 已执行 ${file}`);
      count++;
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(
        `迁移 ${file} 执行失败，已回滚：${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      client.release();
    }
  }

  console.log(count === 0 ? '[migrate] 表结构已是最新，无需变更' : `[migrate] 完成，共执行 ${count} 个迁移`);
}

// 直接运行此文件时执行迁移（npm run migrate）。
// 用 pathToFileURL 做精确比较——靠文件名后缀匹配会在路径含中文或空格时误判。
const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  runMigrations()
    .then(() => closePool())
    .catch(async (err) => {
      console.error('[migrate] 失败：', err instanceof Error ? err.message : err);
      await closePool();
      process.exit(1);
    });
}
