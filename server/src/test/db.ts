import { pool } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';

/**
 * 数据库测试的前置检查。
 *
 * 本机没有 Postgres 时，这些测试应当「跳过」而不是「失败」——
 * 失败会掩盖真正的问题，让人以为代码有 bug。
 */

let available: boolean | null = null;

/** 探测数据库是否可连。结果缓存，避免每个测试文件都等一次超时。 */
export async function databaseAvailable(): Promise<boolean> {
  if (available !== null) return available;
  try {
    await pool.query('SELECT 1');
    available = true;
  } catch {
    available = false;
  }
  return available;
}

/** 建表。测试库需要和生产走同一套迁移，否则测不出 schema 问题。 */
export async function prepareDatabase(): Promise<void> {
  await runMigrations();
}

/**
 * 清空业务数据。
 *
 * 每个测试用例前调用，保证用例之间互不影响。
 * users / devices 上的外键是 CASCADE，删这两张表即可带走下游数据；
 * auth_tokens 没有外键约束，单独删。
 */
export async function resetData(): Promise<void> {
  await pool.query('TRUNCATE users, devices, auth_tokens, explorations, feedback CASCADE');
}
