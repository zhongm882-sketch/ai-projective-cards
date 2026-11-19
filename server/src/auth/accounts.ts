import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { transaction, query, queryOne } from '../db/pool.js';
import { subjectRef } from '../crypto.js';
import type { Subject } from './tokens.js';

/**
 * 账号与设备身份。
 *
 * 密码用 argon2id：抗 GPU 暴力破解，且 @node-rs/argon2 提供预编译二进制，
 * Windows 上不需要本地编译工具链。
 */

// argon2id 的参数。默认值对交互式登录来说偏轻，这里适度提高内存成本。
const ARGON_OPTIONS = {
  memoryCost: 19_456, // 19 MiB，OWASP 建议的下限
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * 一个真实计算出来的 argon2 哈希，专门用于「邮箱不存在」时的假验证。
 *
 * 必须是真哈希：手写一个假字符串会让 argonVerify 立刻因格式错误抛出，
 * 耗时远小于一次真实验证，反而把时间差暴露得更明显。
 * 懒加载 + 缓存，避免每次登录都重新算一遍。
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= argonHash('unused-placeholder-password', ARGON_OPTIONS);
  return dummyHashPromise;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface UserRow {
  id: string;
  email: string;
  phone?: string | null;
  created_at: Date;
}

/**
 * 取得（或创建）一台设备的身份。
 *
 * 用 ON CONFLICT 而不是「先查后插」：并发请求下后者会有两个请求同时判断
 * 「不存在」然后都去插入，其中一个撞唯一索引报错。
 *
 * 如果这台设备已经绑定了账号，返回的 subject 是 user 而非 device——
 * 否则用户在同一台设备上注册后，游客身份还会继续往设备名下写数据。
 */
export async function resolveDevice(deviceKey: string): Promise<Subject> {
  const row = await queryOne<{ id: string; user_id: string | null }>(
    `INSERT INTO devices (device_key)
     VALUES ($1)
     ON CONFLICT (device_key)
       DO UPDATE SET last_seen_at = now()
     RETURNING id, user_id`,
    [deviceKey]
  );

  if (!row) throw new AuthError('设备身份创建失败', 500);

  return row.user_id ? { type: 'user', id: row.user_id } : { type: 'device', id: row.id };
}

/**
 * 注册。
 *
 * 如果带上 deviceKey，会把该设备名下的探索记录一并迁移到新账号：
 * 用户之前作为游客做的探索不该在注册后凭空消失。
 * 整个过程在一个事务里，中途失败不会留下半迁移状态。
 */
export async function registerUser(
  email: string,
  password: string,
  phone?: string,
  deviceKey?: string
): Promise<{ subject: Subject; migrated: number }> {
  const passwordHash = await argonHash(password, ARGON_OPTIONS);

  return transaction(async (client) => {
    const existing = await client.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (existing.rowCount && existing.rowCount > 0) {
      throw new AuthError('这个邮箱已经注册过了', 409);
    }

    // 如果提供了手机号，检查是否已被使用
    if (phone) {
      const phoneExists = await client.query('SELECT 1 FROM users WHERE phone = $1', [phone]);
      if (phoneExists.rowCount && phoneExists.rowCount > 0) {
        throw new AuthError('这个手机号已经注册过了', 409);
      }
    }

    const inserted = await client.query<{ id: string }>(
      'INSERT INTO users (email, password_hash, phone) VALUES ($1, $2, $3) RETURNING id',
      [email, passwordHash, phone || null]
    );
    const userId = inserted.rows[0]?.id;
    if (!userId) throw new AuthError('账号创建失败', 500);

    let migrated = 0;

    if (deviceKey) {
      const device = await client.query<{ id: string }>(
        'SELECT id FROM devices WHERE device_key = $1 AND user_id IS NULL',
        [deviceKey]
      );
      const deviceId = device.rows[0]?.id;

      if (deviceId) {
        // 把设备绑到新账号
        await client.query('UPDATE devices SET user_id = $1 WHERE id = $2', [userId, deviceId]);

        // 探索记录改归属。device_id 保留，便于排查数据来源。
        const moved = await client.query(
          `UPDATE explorations
              SET user_id = $1, updated_at = now()
            WHERE device_id = $2 AND user_id IS NULL`,
          [userId, deviceId]
        );
        migrated = moved.rowCount ?? 0;

        // 反馈也一并归属
        await client.query(
          'UPDATE feedback SET user_id = $1 WHERE device_id = $2 AND user_id IS NULL',
          [userId, deviceId]
        );
      }
    }

    return { subject: { type: 'user', id: userId }, migrated };
  });
}

/** 登录。邮箱或密码错误都返回同一句话，避免暴露哪些邮箱已注册。 */
export async function loginUser(email: string, password: string): Promise<Subject> {
  const row = await queryOne<{ id: string; password_hash: string }>(
    'SELECT id, password_hash FROM users WHERE email = $1',
    [email]
  );

  if (!row) {
    // 即使用户不存在也做一次真实的哈希验证，让响应时间与「密码错误」接近，
    // 否则可以通过耗时差异枚举出哪些邮箱已注册。
    await argonVerify(await getDummyHash(), password).catch(() => false);
    throw new AuthError('邮箱或密码不正确', 401);
  }

  const ok = await argonVerify(row.password_hash, password).catch(() => false);
  if (!ok) throw new AuthError('邮箱或密码不正确', 401);

  return { type: 'user', id: row.id };
}

/**
 * 读取当前身份的公开信息，供前端显示「已登录为 xxx」。
 *
 * ref 是身份的对外引用值：转发层拿它作限流 key。发的是 HMAC 派生值
 * 而不是数据库主键，见 crypto.ts 的 subjectRef。
 */
export async function describeSubject(
  subject: Subject
): Promise<
  | { type: 'user'; email: string; ref: string }
  | { type: 'guest'; ref: string }
> {
  const ref = subjectRef(subject.type, subject.id);

  if (subject.type === 'device') return { type: 'guest', ref };

  const row = await queryOne<{ email: string }>('SELECT email FROM users WHERE id = $1', [
    subject.id,
  ]);
  // 账号被删掉但 token 还没过期时，退化成游客而不是 500。
  if (!row) return { type: 'guest', ref };
  return { type: 'user', email: row.email, ref };
}

/** 清理已过期的 token 记录，避免表无限增长。启动时跑一次即可。 */
export async function pruneExpiredTokens(): Promise<void> {
  await query('DELETE FROM auth_tokens WHERE expires_at < now() - interval \'7 days\'');
}
