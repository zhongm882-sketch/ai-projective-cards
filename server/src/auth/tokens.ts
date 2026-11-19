import { SignJWT, jwtVerify } from 'jose';
import { env } from '../env.js';
import { query, queryOne } from '../db/pool.js';
import { generateToken, hashToken } from '../crypto.js';

/**
 * token 签发与校验。
 *
 * 访问 token：JWT，15 分钟，无状态（不查库，快）。
 * 刷新 token：随机串，30 天，哈希后入库，可吊销。
 *
 * 游客和注册用户走完全相同的结构，只有 subject_type 不同——
 * 这样下游的鉴权、归属判断、限流都不需要区分两套逻辑。
 */

const JWT_KEY = new TextEncoder().encode(env.JWT_SECRET);
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_DAYS = 30;

export type SubjectType = 'user' | 'device';

export interface Subject {
  type: SubjectType;
  id: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** 访问 token 的有效秒数，供前端决定何时刷新 */
  expiresIn: number;
}

async function signAccessToken(subject: Subject): Promise<string> {
  return new SignJWT({ sub: subject.id, styp: subject.type })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(JWT_KEY);
}

/** 校验访问 token。失败返回 null（过期、签名不对、格式错误都算）。 */
export async function verifyAccessToken(token: string): Promise<Subject | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_KEY, { algorithms: ['HS256'] });
    const type = payload.styp;
    const id = payload.sub;
    if ((type !== 'user' && type !== 'device') || typeof id !== 'string') return null;
    return { type, id };
  } catch {
    return null;
  }
}

/** 签发一对新 token，并把刷新 token 的哈希记入数据库。 */
export async function issueTokens(subject: Subject): Promise<TokenPair> {
  const refreshToken = generateToken();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO auth_tokens (subject_type, subject_id, refresh_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [subject.type, subject.id, hashToken(refreshToken), expiresAt]
  );

  return {
    accessToken: await signAccessToken(subject),
    refreshToken,
    expiresIn: ACCESS_TTL_SECONDS,
  };
}

/**
 * 用刷新 token 换一对新的。
 *
 * 采用轮换策略：旧的立即吊销，返回全新的一对。这样即使刷新 token 泄漏，
 * 攻击者用过一次之后合法用户再刷新就会失败，异常可被察觉。
 */
export async function rotateTokens(refreshToken: string): Promise<TokenPair | null> {
  const row = await queryOne<{ id: string; subject_type: SubjectType; subject_id: string }>(
    `SELECT id, subject_type, subject_id
       FROM auth_tokens
      WHERE refresh_hash = $1
        AND revoked_at IS NULL
        AND expires_at > now()`,
    [hashToken(refreshToken)]
  );

  if (!row) return null;

  await query('UPDATE auth_tokens SET revoked_at = now() WHERE id = $1', [row.id]);

  return issueTokens({ type: row.subject_type, id: row.subject_id });
}

/** 吊销单个刷新 token（登出）。 */
export async function revokeToken(refreshToken: string): Promise<void> {
  await query(
    'UPDATE auth_tokens SET revoked_at = now() WHERE refresh_hash = $1 AND revoked_at IS NULL',
    [hashToken(refreshToken)]
  );
}

/** 吊销某个身份的全部 token（改密码、或迁移身份后调用）。 */
export async function revokeAllForSubject(subject: Subject): Promise<void> {
  await query(
    `UPDATE auth_tokens SET revoked_at = now()
      WHERE subject_type = $1 AND subject_id = $2 AND revoked_at IS NULL`,
    [subject.type, subject.id]
  );
}
