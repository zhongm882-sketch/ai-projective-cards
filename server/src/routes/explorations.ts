import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, subjectOf } from '../auth/plugin.js';
import {
  saveExploration,
  listExplorations,
  getExploration,
  updateNote,
  deleteExploration,
  getGrowth,
} from '../repo/explorations.js';

/**
 * 探索记录接口。
 *
 * 所有接口都要求身份（游客 token 也算）。归属过滤发生在 SQL 层，
 * 所以拿别人的 id 来查只会得到 404，不会泄漏内容。
 */

const roundSchema = z.object({
  question: z.string().max(2000),
  answer: z.string().max(20_000),
});

const proseSchema = z.object({
  coreObservations: z.string().max(5000),
  currentFocus: z.string().max(5000),
  possibleExperience: z.string().max(5000),
  innerConflicts: z.string().max(5000),
  needs: z.string().max(5000),
  resources: z.string().max(5000),
  innerStrengths: z.string().max(5000),
  reflectionQuestion: z.string().max(5000),
  weeklyPractice: z.string().max(5000),
});

const explorationSchema = z.object({
  clientId: z.string().trim().min(1).max(100).optional(),
  cardPath: z.string().max(500).nullable().optional(),
  cardDescription: z.string().max(2000).nullable().optional(),
  // 上限 20 轮：正常最多 6 轮，留足余量同时挡住异常大的请求体。
  rounds: z.array(roundSchema).max(20),
  report: z
    .object({
      themes: z.array(z.string().trim().min(1).max(100)).max(20),
      prose: proseSchema,
      provider: z.string().max(50).nullable().optional(),
      model: z.string().max(100).nullable().optional(),
      generatedAt: z.string().datetime().nullable().optional(),
    })
    .optional(),
});

/** UUID 校验。不合法的 id 直接 400，不必走一趟数据库。 */
const idSchema = z.string().uuid();

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function explorationRoutes(app: FastifyInstance): Promise<void> {
  /** 上传一次完整探索（含报告）。用 clientId 幂等，重复上传是更新而非新增。 */
  app.post('/explorations', { preHandler: requireAuth }, async (request, reply) => {
    const body = explorationSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: body.error.issues[0]?.message ?? '请求内容不合法',
      });
    }

    const { id } = await saveExploration(subjectOf(request), body.data);
    return reply.code(201).send({ id });
  });

  /** 分页列出摘要。不解密正文。 */
  app.get('/explorations', { preHandler: requireAuth }, async (request, reply) => {
    const q = paginationSchema.safeParse(request.query);
    if (!q.success) {
      return reply.code(400).send({ error: '分页参数不合法' });
    }

    return listExplorations(subjectOf(request), q.data.limit, q.data.offset);
  });

  /** 单条完整记录（解密）。 */
  app.get('/explorations/:id', { preHandler: requireAuth }, async (request, reply) => {
    const id = idSchema.safeParse((request.params as { id?: string }).id);
    if (!id.success) {
      return reply.code(400).send({ error: '记录 ID 不合法' });
    }

    const detail = await getExploration(subjectOf(request), id.data);
    // 不属于当前身份的记录同样走这里 → 404，不区分「不存在」和「不属于你」，
    // 避免通过状态码探测别人记录是否存在。
    if (!detail) {
      return reply.code(404).send({ error: '记录不存在' });
    }

    return detail;
  });

  /** 更新「还有什么想说的吗」。 */
  app.patch('/explorations/:id/note', { preHandler: requireAuth }, async (request, reply) => {
    const id = idSchema.safeParse((request.params as { id?: string }).id);
    if (!id.success) {
      return reply.code(400).send({ error: '记录 ID 不合法' });
    }

    const body = z
      .object({ note: z.string().max(10_000) })
      .safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: '留言内容过长' });
    }

    const ok = await updateNote(subjectOf(request), id.data, body.data.note);
    if (!ok) {
      return reply.code(404).send({ error: '记录不存在' });
    }

    return { ok: true };
  });

  app.delete('/explorations/:id', { preHandler: requireAuth }, async (request, reply) => {
    const id = idSchema.safeParse((request.params as { id?: string }).id);
    if (!id.success) {
      return reply.code(400).send({ error: '记录 ID 不合法' });
    }

    const ok = await deleteExploration(subjectOf(request), id.data);
    if (!ok) {
      return reply.code(404).send({ error: '记录不存在' });
    }

    return { ok: true };
  });

  /** 成长轨迹。全部基于明文的主题表聚合，不解密任何正文。 */
  app.get('/growth', { preHandler: requireAuth }, async (request) => {
    return getGrowth(subjectOf(request));
  });
}
