import { transaction, query, queryOne } from '../db/pool.js';
import { sealJson, openJson, seal, open } from '../crypto.js';
import type { Subject } from '../auth/tokens.js';

/**
 * 探索记录的读写。
 *
 * 加密在这一层完成——上面的路由只看到明文对象，下面的数据库只看到密文。
 * 这样加密就不会被某个新写的查询绕过去。
 */

export interface Round {
  question: string;
  answer: string;
}

export interface ReportProse {
  coreObservations: string;
  currentFocus: string;
  possibleExperience: string;
  innerConflicts: string;
  needs: string;
  resources: string;
  innerStrengths: string;
  reflectionQuestion: string;
  weeklyPractice: string;
}

export interface ExplorationInput {
  clientId?: string;
  cardPath?: string | null;
  cardDescription?: string | null;
  rounds: Round[];
  report?: {
    themes: string[];
    prose: ReportProse;
    provider?: string | null;
    model?: string | null;
    generatedAt?: string | null;
  };
}

/** 列表项：只含摘要和主题，不解密正文——列表不需要正文，也不该顺手解密。 */
export interface ExplorationSummary {
  id: string;
  clientId: string | null;
  cardPath: string | null;
  roundCount: number;
  themes: string[];
  hasNote: boolean;
  createdAt: string;
}

export interface ExplorationDetail extends ExplorationSummary {
  cardDescription: string | null;
  rounds: Round[];
  note: string | null;
  report: {
    themes: string[];
    prose: ReportProse;
    provider: string | null;
    model: string | null;
    generatedAt: string;
  } | null;
}

/**
 * 归属条件。用户看自己的，游客看这台设备的。
 *
 * 归属判断一律拼进 SQL 的 WHERE，而不是「查出来再比对」——
 * 后者一旦某处忘记比对就是越权漏洞，前者查不到就是查不到。
 *
 * @param alias 表别名（带 JOIN 的查询需要，如 'e'）
 */
function ownerClause(
  subject: Subject,
  paramIndex: number,
  alias = ''
): { sql: string; value: string } {
  const p = alias ? `${alias}.` : '';
  return subject.type === 'user'
    ? { sql: `${p}user_id = $${paramIndex}`, value: subject.id }
    : {
        sql: `${p}device_id = $${paramIndex} AND ${p}user_id IS NULL`,
        value: subject.id,
      };
}

/**
 * 保存一次完整探索。
 *
 * 用 client_id 做幂等：网络重试或用户重复点击不应产生两条记录。
 * 已存在则更新（覆盖报告），而不是报错——前端重试应当成功。
 */
export async function saveExploration(
  subject: Subject,
  input: ExplorationInput
): Promise<{ id: string }> {
  const rounds = sealJson(input.rounds);

  return transaction(async (client) => {
    const userId = subject.type === 'user' ? subject.id : null;
    const deviceId = subject.type === 'device' ? subject.id : null;

    // 先按 client_id 找已有记录（同一归属下）
    let explorationId: string | null = null;
    if (input.clientId) {
      const owner = ownerClause(subject, 2);
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM explorations WHERE client_id = $1 AND ${owner.sql}`,
        [input.clientId, owner.value]
      );
      explorationId = existing.rows[0]?.id ?? null;
    }

    if (explorationId) {
      await client.query(
        `UPDATE explorations
            SET rounds_cipher = $1, rounds_iv = $2, rounds_tag = $3,
                round_count = $4, card_path = $5, card_description = $6,
                updated_at = now()
          WHERE id = $7`,
        [
          rounds.cipher,
          rounds.iv,
          rounds.tag,
          input.rounds.length,
          input.cardPath ?? null,
          input.cardDescription ?? null,
          explorationId,
        ]
      );
    } else {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO explorations
           (client_id, user_id, device_id, card_path, card_description,
            rounds_cipher, rounds_iv, rounds_tag, round_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          input.clientId ?? null,
          userId,
          deviceId,
          input.cardPath ?? null,
          input.cardDescription ?? null,
          rounds.cipher,
          rounds.iv,
          rounds.tag,
          input.rounds.length,
        ]
      );
      explorationId = inserted.rows[0]?.id ?? null;
    }

    if (!explorationId) throw new Error('保存探索记录失败');

    if (input.report) {
      const prose = sealJson(input.report.prose);

      // exploration_id 上有唯一约束，重复上传走 DO UPDATE 覆盖旧报告。
      const reportRow = await client.query<{ id: string }>(
        `INSERT INTO reports
           (exploration_id, prose_cipher, prose_iv, prose_tag, provider, model, generated_at)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()))
         ON CONFLICT (exploration_id) DO UPDATE
           SET prose_cipher = EXCLUDED.prose_cipher,
               prose_iv     = EXCLUDED.prose_iv,
               prose_tag    = EXCLUDED.prose_tag,
               provider     = EXCLUDED.provider,
               model        = EXCLUDED.model,
               generated_at = EXCLUDED.generated_at
         RETURNING id`,
        [
          explorationId,
          prose.cipher,
          prose.iv,
          prose.tag,
          input.report.provider ?? null,
          input.report.model ?? null,
          input.report.generatedAt ?? null,
        ]
      );

      const reportId = reportRow.rows[0]?.id;
      if (reportId) {
        // 主题整组替换，避免覆盖更新后残留旧主题
        await client.query('DELETE FROM report_themes WHERE report_id = $1', [reportId]);

        // 去重后写入：主键是 (report_id, theme)，AI 偶尔会输出重复主题。
        const themes = [...new Set(input.report.themes.filter((t) => t.trim()))];
        for (const [position, theme] of themes.entries()) {
          await client.query(
            'INSERT INTO report_themes (report_id, theme, position) VALUES ($1, $2, $3)',
            [reportId, theme.trim(), position]
          );
        }
      }
    }

    return { id: explorationId };
  });
}

/** 分页列出探索摘要。不解密正文。 */
export async function listExplorations(
  subject: Subject,
  limit = 20,
  offset = 0
): Promise<{ items: ExplorationSummary[]; total: number }> {
  // 两条查询的表别名不同，各自生成条件，避免共用一份而在加 JOIN 后出错。
  const owner = ownerClause(subject, 1, 'e');
  const ownerNoAlias = ownerClause(subject, 1);

  const rows = await query<{
    id: string;
    client_id: string | null;
    card_path: string | null;
    round_count: number;
    has_note: boolean;
    created_at: Date;
    themes: string[] | null;
  }>(
    `SELECT e.id, e.client_id, e.card_path, e.round_count,
            (e.note_cipher IS NOT NULL) AS has_note,
            e.created_at,
            ARRAY(
              SELECT rt.theme FROM report_themes rt
                JOIN reports r ON r.id = rt.report_id
               WHERE r.exploration_id = e.id
               ORDER BY rt.position
            ) AS themes
       FROM explorations e
      WHERE ${owner.sql}
      ORDER BY e.created_at DESC
      LIMIT $2 OFFSET $3`,
    [owner.value, limit, offset]
  );

  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM explorations WHERE ${ownerNoAlias.sql}`,
    [ownerNoAlias.value]
  );

  return {
    items: rows.map((r) => ({
      id: r.id,
      clientId: r.client_id,
      cardPath: r.card_path,
      roundCount: r.round_count,
      themes: r.themes ?? [],
      hasNote: r.has_note,
      createdAt: r.created_at.toISOString(),
    })),
    total: Number(countRow?.count ?? 0),
  };
}

/**
 * 读取单条完整记录（解密）。
 *
 * 归属条件写在 SQL 里而不是取出来再比对——后者一旦忘记比对就是越权漏洞。
 * 不属于当前身份的记录直接查不到，返回 null。
 */
export async function getExploration(
  subject: Subject,
  id: string
): Promise<ExplorationDetail | null> {
  const owner = ownerClause(subject, 2, 'e');

  const row = await queryOne<{
    id: string;
    client_id: string | null;
    card_path: string | null;
    card_description: string | null;
    round_count: number;
    created_at: Date;
    rounds_cipher: Buffer;
    rounds_iv: Buffer;
    rounds_tag: Buffer;
    note_cipher: Buffer | null;
    note_iv: Buffer | null;
    note_tag: Buffer | null;
    report_id: string | null;
    prose_cipher: Buffer | null;
    prose_iv: Buffer | null;
    prose_tag: Buffer | null;
    provider: string | null;
    model: string | null;
    generated_at: Date | null;
  }>(
    `SELECT e.id, e.client_id, e.card_path, e.card_description, e.round_count, e.created_at,
            e.rounds_cipher, e.rounds_iv, e.rounds_tag,
            e.note_cipher, e.note_iv, e.note_tag,
            r.id AS report_id, r.prose_cipher, r.prose_iv, r.prose_tag,
            r.provider, r.model, r.generated_at
       FROM explorations e
       LEFT JOIN reports r ON r.exploration_id = e.id
      WHERE e.id = $1 AND ${owner.sql}`,
    [id, owner.value]
  );

  if (!row) return null;

  const themes = row.report_id
    ? (
        await query<{ theme: string }>(
          'SELECT theme FROM report_themes WHERE report_id = $1 ORDER BY position',
          [row.report_id]
        )
      ).map((t) => t.theme)
    : [];

  const note =
    row.note_cipher && row.note_iv && row.note_tag
      ? open({ cipher: row.note_cipher, iv: row.note_iv, tag: row.note_tag })
      : null;

  return {
    id: row.id,
    clientId: row.client_id,
    cardPath: row.card_path,
    cardDescription: row.card_description,
    roundCount: row.round_count,
    createdAt: row.created_at.toISOString(),
    rounds: openJson<Round[]>({
      cipher: row.rounds_cipher,
      iv: row.rounds_iv,
      tag: row.rounds_tag,
    }),
    note,
    hasNote: note !== null,
    themes,
    report:
      row.prose_cipher && row.prose_iv && row.prose_tag
        ? {
            themes,
            prose: openJson<ReportProse>({
              cipher: row.prose_cipher,
              iv: row.prose_iv,
              tag: row.prose_tag,
            }),
            provider: row.provider,
            model: row.model,
            generatedAt: (row.generated_at ?? row.created_at).toISOString(),
          }
        : null,
  };
}

/** 更新「还有什么想说的吗」那段留言。 */
export async function updateNote(
  subject: Subject,
  id: string,
  note: string
): Promise<boolean> {
  const owner = ownerClause(subject, 5);
  const sealed = seal(note);

  const rows = await query<{ id: string }>(
    `UPDATE explorations
        SET note_cipher = $2, note_iv = $3, note_tag = $4, updated_at = now()
      WHERE id = $1 AND ${owner.sql}
      RETURNING id`,
    [id, sealed.cipher, sealed.iv, sealed.tag, owner.value]
  );

  return rows.length > 0;
}

export async function deleteExploration(subject: Subject, id: string): Promise<boolean> {
  const owner = ownerClause(subject, 2);
  const rows = await query<{ id: string }>(
    `DELETE FROM explorations WHERE id = $1 AND ${owner.sql} RETURNING id`,
    [id, owner.value]
  );
  return rows.length > 0;
}

/**
 * 成长轨迹统计。
 *
 * 全部基于明文的 report_themes 表做聚合，不需要解密任何正文——
 * 这正是把主题标签留在明文的价值所在。
 */
export async function getGrowth(subject: Subject): Promise<{
  sessions: number;
  themeHistory: { theme: string; count: number; firstSeen: string; lastSeen: string }[];
  lastExplored: string | null;
}> {
  const owner = ownerClause(subject, 1, 'e');

  const themes = await query<{
    theme: string;
    count: string;
    first_seen: Date;
    last_seen: Date;
  }>(
    `SELECT rt.theme,
            COUNT(*)::text     AS count,
            MIN(e.created_at)  AS first_seen,
            MAX(e.created_at)  AS last_seen
       FROM report_themes rt
       JOIN reports r     ON r.id = rt.report_id
       JOIN explorations e ON e.id = r.exploration_id
      WHERE ${owner.sql}
      GROUP BY rt.theme
      ORDER BY COUNT(*) DESC, MAX(e.created_at) DESC`,
    [owner.value]
  );

  const stats = await queryOne<{ sessions: string; last_explored: Date | null }>(
    `SELECT COUNT(*)::text AS sessions, MAX(e.created_at) AS last_explored
       FROM explorations e
      WHERE ${owner.sql}`,
    [owner.value]
  );

  return {
    sessions: Number(stats?.sessions ?? 0),
    themeHistory: themes.map((t) => ({
      theme: t.theme,
      count: Number(t.count),
      firstSeen: t.first_seen.toISOString(),
      lastSeen: t.last_seen.toISOString(),
    })),
    lastExplored: stats?.last_explored?.toISOString() ?? null,
  };
}
