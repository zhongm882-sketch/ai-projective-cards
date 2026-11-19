import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, subjectOf } from '../auth/plugin.js';
import { query } from '../db/pool.js';
import { safeCompare } from '../crypto.js';

/**
 * 反馈与管理接口。
 *
 * 反馈内容不加密：它是用户主动写给我们看的，且管理页需要直接阅读。
 * 但 contact（联系方式）属于个人信息，只在管理接口里返回，列表接口不暴露。
 */

const feedbackSchema = z.object({
  message: z.string().trim().min(1, '请写点什么').max(5000),
  contact: z.string().trim().max(200).optional(),
});

export async function feedbackRoutes(app: FastifyInstance): Promise<void> {
  app.post('/feedback', { preHandler: requireAuth }, async (request, reply) => {
    const body = feedbackSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? '内容不合法' });
    }

    const subject = subjectOf(request);
    await query(
      `INSERT INTO feedback (user_id, device_id, message, contact)
       VALUES ($1, $2, $3, $4)`,
      [
        subject.type === 'user' ? subject.id : null,
        subject.type === 'device' ? subject.id : null,
        body.data.message,
        body.data.contact ?? null,
      ]
    );

    return reply.code(201).send({ ok: true });
  });
}

/**
 * 管理接口。
 *
 * 嵌套目录里那版 /api/admin 完全没有鉴权，任何人都能拉走所有人的报告——
 * 这里必须带凭据，且 ADMIN_TOKEN 未配置时整组路由根本不注册。
 *
 * 注意：即便是管理员也读不到探索正文。正文用应用层密钥加密，
 * 这个接口只暴露反馈和不含内容的统计。
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const adminToken = app.appEnv.adminToken;

  // 没配 token 就不注册路由——比留一个弱口令安全。
  if (!adminToken) {
    app.log.warn('[admin] 未配置 ADMIN_TOKEN，管理接口已关闭');
    return;
  }

  app.addHook('onRequest', async (request, reply) => {
    const header = request.headers.authorization;
    const provided = header?.startsWith('Bearer ') ? header.slice(7) : '';
    // 恒定时间比较，避免通过响应耗时逐字节猜 token。
    if (!provided || !safeCompare(provided, adminToken)) {
      await reply.code(401).send({ error: '未授权' });
    }
  });

  app.get('/admin/feedback', async (request) => {
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);

    const rows = await query<{
      id: string;
      message: string;
      contact: string | null;
      created_at: Date;
    }>(
      `SELECT id, message, contact, created_at
         FROM feedback
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2`,
      [q.limit, q.offset]
    );

    return {
      items: rows.map((r) => ({
        id: r.id,
        message: r.message,
        contact: r.contact,
        createdAt: r.created_at.toISOString(),
      })),
    };
  });

  /** 汇总统计。只有计数和主题词，不含任何探索正文。 */
  app.get('/admin/stats', async () => {
    const [counts, topThemes, models] = await Promise.all([
      query<{ users: string; devices: string; explorations: string; reports: string }>(
        `SELECT
           (SELECT COUNT(*)::text FROM users)        AS users,
           (SELECT COUNT(*)::text FROM devices)      AS devices,
           (SELECT COUNT(*)::text FROM explorations) AS explorations,
           (SELECT COUNT(*)::text FROM reports)      AS reports`
      ),
      query<{ theme: string; count: string }>(
        `SELECT theme, COUNT(*)::text AS count
           FROM report_themes
          GROUP BY theme
          ORDER BY COUNT(*) DESC
          LIMIT 30`
      ),
      query<{ model: string | null; count: string }>(
        `SELECT model, COUNT(*)::text AS count
           FROM reports
          GROUP BY model
          ORDER BY COUNT(*) DESC`
      ),
    ]);

    const c = counts[0];
    return {
      counts: {
        users: Number(c?.users ?? 0),
        devices: Number(c?.devices ?? 0),
        explorations: Number(c?.explorations ?? 0),
        reports: Number(c?.reports ?? 0),
      },
      topThemes: topThemes.map((t) => ({ theme: t.theme, count: Number(t.count) })),
      models: models.map((m) => ({ model: m.model, count: Number(m.count) })),
    };
  });
}
