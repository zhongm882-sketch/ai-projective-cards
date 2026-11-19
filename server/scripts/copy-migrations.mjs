import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 把 .sql 迁移文件复制到 dist/。
 *
 * tsc 只处理 .ts，不会搬运其他文件——不复制的话 `npm start` 会在
 * 启动跑迁移时因为找不到 migrations 目录而崩掉。
 */

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const from = join(root, 'src', 'db', 'migrations');
const to = join(root, 'dist', 'db', 'migrations');

await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });

console.log('[build] 迁移文件已复制到 dist/db/migrations');
