import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

/**
 * 访问口令门（服务端）。
 *
 * 解决的问题：AI 接口对公网开放，游客身份又是零门槛自动发放的——
 * 只要知道网址，任何人都能开始探索、花服务端的钱。限流挡得住脚本循环刷，
 * 挡不住换 IP 的有心人。口令门是最后一道闸：只有拿到口令的人才能用。
 *
 * 设计取舍：
 *  - 口令放在环境变量 ACCESS_CODE。没配置 = 门是开着的（本地开发不受影响）。
 *  - 输对一次，种一个 httpOnly 的签名 cookie（30 天），不用反复输。
 *  - 口令比较双方各自 HMAC 后再比，避免长度差异带来时序侧信道。
 *  - cookie 用独立的 ACCESS_SECRET 签名：即使 cookie 被人看到，
 *    也无法用低熵的口令本身去离线爆破签名。
 */

const COOKIE_NAME = 'ohg';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** 门是否启用。未配置 ACCESS_CODE 时视为不启用（本地开发/测试）。 */
export function accessGateEnabled(): boolean {
  return Boolean(process.env.ACCESS_CODE?.trim());
}

/** 签名密钥：优先 ACCESS_SECRET，退化用 ACCESS_CODE（仅保证能跑，不推荐）。 */
function signSecret(): string {
  return (process.env.ACCESS_SECRET?.trim() || process.env.ACCESS_CODE?.trim()) ?? '';
}

function sign(exp: string): string {
  return createHmac('sha256', signSecret()).update(exp).digest('hex');
}

/** 校验用户输入的口令。门未启用时一律通过。 */
export function checkAccessCode(input: unknown): boolean {
  if (!accessGateEnabled()) return true;
  if (typeof input !== 'string') return false;

  const expected = process.env.ACCESS_CODE!.trim();
  const a = createHmac('sha256', 'code-compare').update(input).digest();
  const b = createHmac('sha256', 'code-compare').update(expected).digest();
  return timingSafeEqual(a, b);
}

export interface AccessCookie {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    sameSite: 'lax';
    secure: boolean;
    path: string;
    maxAge: number;
  };
}

/** 生成一个带过期时间戳的签名 cookie。 */
export function issueAccessCookie(): AccessCookie {
  const exp = String(Date.now() + MAX_AGE_SECONDS * 1000);
  return {
    name: COOKIE_NAME,
    value: `${exp}.${sign(exp)}`,
    options: {
      httpOnly: true,
      sameSite: 'lax',
      // 网站对外只通过 HTTPS 提供服务；局域网 http 访问本来就不支持完整功能
      secure: true,
      path: '/',
      maxAge: MAX_AGE_SECONDS,
    },
  };
}

/** 请求是否带着有效的通行 cookie。门未启用时一律通过。 */
export function hasValidAccess(request: NextRequest): boolean {
  if (!accessGateEnabled()) return true;

  const raw = request.cookies.get(COOKIE_NAME)?.value;
  if (!raw) return false;

  const [exp, sig] = raw.split('.');
  if (!exp || !sig) return false;

  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now()) return false;

  const expected = sign(exp);
  if (sig.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
