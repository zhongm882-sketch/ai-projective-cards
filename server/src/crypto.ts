import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
  createHash,
  createHmac,
} from 'node:crypto';
import { env } from './env.js';

/**
 * 内容加密。
 *
 * 用户逐字说的话和报告正文是这个产品里最敏感的数据，所以在写库之前
 * 用 AES-256-GCM 加密——数据库被脱库也读不出内容。
 *
 * 选 GCM 而不是 CBC：GCM 自带完整性校验（authTag），密文被篡改会在解密时
 * 直接报错，而不是解出一段错误明文。
 */

const KEY = Buffer.from(env.CONTENT_ENCRYPTION_KEY, 'hex');
const ALGORITHM = 'aes-256-gcm';
/** GCM 推荐 12 字节 IV */
const IV_LENGTH = 12;

export interface Sealed {
  cipher: Buffer;
  iv: Buffer;
  tag: Buffer;
}

/** 加密一段文本。每次调用都生成新的随机 IV——绝不复用。 */
export function seal(plaintext: string): Sealed {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { cipher: encrypted, iv, tag: cipher.getAuthTag() };
}

/** 解密。密文被篡改或密钥不对都会抛错。 */
export function open(sealed: Sealed): string {
  const decipher = createDecipheriv(ALGORITHM, KEY, sealed.iv);
  decipher.setAuthTag(sealed.tag);
  return Buffer.concat([decipher.update(sealed.cipher), decipher.final()]).toString('utf8');
}

/** 把任意 JSON 值加密存储。 */
export function sealJson(value: unknown): Sealed {
  return seal(JSON.stringify(value));
}

/** 解密回 JSON 值。 */
export function openJson<T>(sealed: Sealed): T {
  return JSON.parse(open(sealed)) as T;
}

/**
 * 刷新 token 的哈希。
 *
 * 刷新 token 要能被吊销，所以必须入库；但明文入库等于把长期凭据存在数据库里。
 * 用 SHA-256 哈希后存——token 本身是 32 字节随机值，熵足够高，
 * 不需要 argon2 那样的慢哈希（那是为了对抗弱密码字典攻击）。
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 生成一个新的刷新 token（原文，只在响应里出现一次）。 */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * 身份的对外引用值。
 *
 * 用途：转发层要按身份限流，就需要一个稳定的 key。直接把 user_id / device_id
 * 发出去也能用，但那是数据库主键——一旦出现在日志、前端变量或错误上报里，
 * 就成了可以用来拼接查询的内部标识。
 *
 * 所以发一个 HMAC 派生值：对同一个身份永远相同（能用来计数），
 * 但不能反推回主键，也不能被外部伪造（要有 JWT_SECRET 才算得出来）。
 * 截断到 32 个十六进制字符（128 位）——用作标识足够，不需要全长。
 */
export function subjectRef(type: string, id: string): string {
  return createHmac('sha256', env.JWT_SECRET)
    .update(`${type}:${id}`)
    .digest('hex')
    .slice(0, 32);
}

/** 定长字符串的恒定时间比较，避免通过响应时间差反推内容。 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
