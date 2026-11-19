import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  issueTokens,
  rotateTokens,
  revokeToken,
  type Subject,
} from '../auth/tokens.js';
import {
  resolveDevice,
  registerUser,
  loginUser,
  describeSubject,
  AuthError,
} from '../auth/accounts.js';

/**
 * 鉴权路由。
 *
 * token 通过 httpOnly cookie 下发，浏览器里的 JS 读不到——
 * 这样即使页面上有 XSS，攻击者也拿不走凭据。
 */

const ACCESS_COOKIE = 'pc_access';
const REFRESH_COOKIE = 'pc_refresh';

const emailSchema = z.string().trim().toLowerCase().email('请填写有效的邮箱地址');
// 密码只限最短长度，不强制大小写数字符号的组合——
// 那类规则会把人推向 "Password1!" 这种可预测的密码。
const passwordSchema = z
  .string()
  .min(8, '密码至少 8 位')
  .max(200, '密码过长');
const phoneSchema = z
  .string()
  .trim()
  .regex(/^1[3-9]\d{9}$/, '请填写有效的中国大陆手机号')
  .optional();
const deviceKeySchema = z.string().trim().min(16).max(200);

export function setAuthCookies(
  reply: import('fastify').FastifyReply,
  tokens: { accessToken: string; refreshToken: string; expiresIn: number },
  isProduction: boolean
): void {
  const base = {
    httpOnly: true,
    // 生产环境要求 HTTPS；本地开发是 http，加了 Secure 浏览器会直接丢弃 cookie。
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
  };

  reply.setCookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base,
    maxAge: tokens.expiresIn,
  });
  reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    maxAge: 30 * 24 * 60 * 60,
  });
}

function clearAuthCookies(reply: import('fastify').FastifyReply): void {
  reply.clearCookie(ACCESS_COOKIE, { path: '/' });
  reply.clearCookie(REFRESH_COOKIE, { path: '/' });
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const isProduction = app.appEnv.isProduction;

  /**
   * 游客身份：拿设备标识换一对 token。
   *
   * 单独加 IP 限流：游客身份是零门槛发放的，不限速的话，
   * 「拿新身份刷 AI 配额」就没有成本。20 次/小时对正常用户绰绰有余
   * （一次访问通常只换 1~2 个身份）。
   */
  app.post(
    '/auth/guest',
    {
      config: {
        rateLimit: { max: 20, timeWindow: '1 hour', keyGenerator: (req) => req.ip },
      },
    },
    async (request, reply) => {
      const body = z.object({ deviceKey: deviceKeySchema }).safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: '设备标识无效' });
      }

      const subject = await resolveDevice(body.data.deviceKey);
      const tokens = await issueTokens(subject);
      setAuthCookies(reply, tokens, isProduction);

      return { identity: await describeSubject(subject) };
    }
  );

  /** 注册。带 deviceKey 时会把游客期间的探索记录迁移过来。 */
  app.post('/auth/register', async (request, reply) => {
    const body = z
      .object({
        email: emailSchema,
        password: passwordSchema,
        phone: phoneSchema,
        deviceKey: deviceKeySchema.optional(),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? '注册信息有误' });
    }

    try {
      const { subject, migrated } = await registerUser(
        body.data.email,
        body.data.password,
        body.data.phone,
        body.data.deviceKey
      );
      const tokens = await issueTokens(subject);
      setAuthCookies(reply, tokens, isProduction);

      return {
        identity: await describeSubject(subject),
        // 让前端能提示「已把 3 次探索同步到账号」
        migrated,
      };
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  app.post('/auth/login', async (request, reply) => {
    const body = z
      .object({ email: emailSchema, password: z.string().min(1) })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: '请填写邮箱和密码' });
    }

    try {
      const subject = await loginUser(body.data.email, body.data.password);
      const tokens = await issueTokens(subject);
      setAuthCookies(reply, tokens, isProduction);
      return { identity: await describeSubject(subject) };
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  /** 刷新。旧的刷新 token 会被立即吊销（轮换策略）。 */
  app.post('/auth/refresh', async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_COOKIE];
    if (!refreshToken) {
      return reply.code(401).send({ error: '请先登录' });
    }

    const tokens = await rotateTokens(refreshToken);
    if (!tokens) {
      // 刷新 token 失效：清掉 cookie，否则前端会拿着废凭据反复重试。
      clearAuthCookies(reply);
      return reply.code(401).send({ error: '登录状态已过期，请重新登录' });
    }

    setAuthCookies(reply, tokens, isProduction);
    return { ok: true };
  });

  app.post('/auth/logout', async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_COOKIE];
    if (refreshToken) await revokeToken(refreshToken);
    clearAuthCookies(reply);
    return { ok: true };
  });

  /** 当前身份。未登录返回 null，不算错误——前端用它决定显示登录入口还是账号信息。 */
  app.get('/auth/me', async (request) => {
    const subject: Subject | null = request.subject ?? null;
    if (!subject) return { identity: null };
    return { identity: await describeSubject(subject) };
  });
}

export { ACCESS_COOKIE, REFRESH_COOKIE };
