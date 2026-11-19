import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { env } from './env.js';
import { authPlugin } from './auth/plugin.js';
import { authRoutes } from './routes/auth.js';
import { explorationRoutes } from './routes/explorations.js';
import { feedbackRoutes, adminRoutes } from './routes/feedback.js';

/**
 * 组装 Fastify 实例。
 *
 * 单独拆出来是为了测试能拿到一个不监听端口的实例（app.inject()）。
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.isProduction ? 'info' : 'debug',
      // 请求体里含用户对话，绝不能进日志。
      // Fastify 默认不记录 body，这里显式收窄序列化字段，防止以后有人加上。
      serializers: {
        req: (request) => ({
          method: request.method,
          url: request.url,
        }),
      },
    },
    // 对话内容可能较长，但 1MB 足够；再大基本是异常请求。
    bodyLimit: 1_048_576,
    trustProxy: env.isProduction,
  });

  app.decorate('appEnv', {
    isProduction: env.isProduction,
    adminToken: env.adminEnabled ? env.ADMIN_TOKEN : undefined,
  });

  await app.register(cookie);

  await app.register(cors, {
    origin: env.corsOrigins,
    // 必须允许携带凭据，否则 httpOnly cookie 不会被发送。
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    // 有身份时按身份限流，否则退回 IP——
    // 只按 IP 会让同一办公网络的用户互相挤占额度。
    keyGenerator: (request) => request.subject?.id ?? request.ip,
  });

  // 直接挂载认证钩子，避免 register 的封装作用域导致后续路由无法继承身份。
  await authPlugin(app);

  app.get('/health', async () => ({ ok: true }));

  await app.register(authRoutes);
  await app.register(explorationRoutes);
  await app.register(feedbackRoutes);
  await app.register(adminRoutes);

  // 统一错误处理。
  // Fastify 5.11 起 error 的类型是 unknown，需要自己收窄——
  // 这反而更安全：迫使我们显式处理「抛出的不是 Error」的情况。
  app.setErrorHandler((error: unknown, request, reply) => {
    const status =
      (typeof error === 'object' && error !== null && 'statusCode' in error
        ? (error as { statusCode?: number }).statusCode
        : undefined) ?? 500;
    const message = error instanceof Error ? error.message : '未知错误';

    if (status >= 500) {
      // 记 message 而非整个 error：某些库的错误对象会挂上含凭据的请求配置。
      app.log.error({ url: request.url, err: message }, '请求处理失败');
      return reply.code(status).send({ error: '服务器内部错误' });
    }

    // 4xx 是可预期的，把提示原样返回给前端。
    return reply.code(status).send({ error: message });
  });

  return app;
}
