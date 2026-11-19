import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken, type Subject } from './tokens.js';
import { ACCESS_COOKIE } from '../routes/auth.js';

/**
 * 鉴权装饰。
 *
 * onRequest 钩子里解析访问 token，把身份挂到 request.subject 上。
 * 解析失败不报错——公开接口（/auth/guest、/health）仍然要能访问。
 * 需要身份的接口用下面的 requireAuth 作为 preHandler 显式声明。
 */

declare module 'fastify' {
  interface FastifyRequest {
    subject?: Subject;
  }
  interface FastifyInstance {
    /**
     * 运行期配置。挂在实例上而不是各文件直接 import env，
     * 是为了让测试能注入不同配置。
     */
    appEnv: {
      isProduction: boolean;
      /** 未配置时为 undefined，管理路由会整组跳过注册 */
      adminToken?: string;
    };
  }
}

export async function authPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest('subject', undefined);

  app.addHook('onRequest', async (request) => {
    // 优先读 cookie（浏览器直连）；没有则读 Bearer 头（Next.js 转发层）。
    const fromCookie = request.cookies[ACCESS_COOKIE];
    const header = request.headers.authorization;
    const fromHeader = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    const token = fromCookie ?? fromHeader;
    if (!token) return;

    const subject = await verifyAccessToken(token);
    if (subject) request.subject = subject;
  });
}

/**
 * 要求已有身份（游客也算）。
 *
 * 401 与 403 的区别在这里很重要：401 表示「没有身份，去拿一个」，
 * 前端收到会自动调 /auth/guest 或 /auth/refresh 再重试；
 * 403 表示「有身份但不允许」，重试没有意义。
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.subject) {
    await reply.code(401).send({ error: '请先获取身份' });
  }
}

/** 在 preHandler 之后取身份。requireAuth 已经保证它存在。 */
export function subjectOf(request: FastifyRequest): Subject {
  const subject = request.subject;
  if (!subject) {
    // 走到这里说明某个路由忘了挂 requireAuth，属于编程错误而非用户错误。
    throw new Error('路由缺少 requireAuth preHandler');
  }
  return subject;
}
