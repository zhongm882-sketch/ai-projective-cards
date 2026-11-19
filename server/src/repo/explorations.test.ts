import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { databaseAvailable, prepareDatabase, resetData } from '../test/db.js';
import { closePool, query, queryOne } from '../db/pool.js';
import { resolveDevice, registerUser, loginUser, AuthError } from '../auth/accounts.js';
import { issueTokens, rotateTokens, revokeToken, verifyAccessToken } from '../auth/tokens.js';
import {
  saveExploration,
  listExplorations,
  getExploration,
  updateNote,
  deleteExploration,
  getGrowth,
  type ExplorationInput,
} from './explorations.js';

/**
 * 数据库集成测试。
 *
 * 本机没有 Postgres 时整组跳过——跳过比虚假失败好，后者会掩盖真问题。
 * 配好 DATABASE_URL 后这些用例会真实跑起来。
 */

const hasDb = await databaseAvailable();

const describeDb = hasDb ? describe : describe.skip;

if (!hasDb) {
  console.warn(
    '[test] 未检测到可用的 Postgres，已跳过数据库测试。' +
      '配置 server/.env 里的 DATABASE_URL 后可运行。'
  );
}

/** 构造一份最小可用的探索数据。 */
function sampleInput(overrides: Partial<ExplorationInput> = {}): ExplorationInput {
  return {
    clientId: `client-${Math.random().toString(36).slice(2)}`,
    cardPath: '/cards/test.webp',
    cardDescription: 'two people standing back to back',
    rounds: [
      { question: '你首先注意到了什么？', answer: '两个人背对背。' },
      { question: '他们之间发生了什么？', answer: '好像刚吵完架。' },
    ],
    report: {
      themes: ['关系', '距离'],
      prose: {
        coreObservations: '你的表达里反复出现「背对」这个意象。',
        currentFocus: '你似乎更关注关系中的距离。',
        possibleExperience: '也许你最近正经历一段沉默。',
        innerConflicts: '想靠近又怕受伤。',
        needs: '被理解的渴望。',
        resources: '你能清晰命名自己的感受。',
        innerStrengths: '细腻的觉察力。',
        reflectionQuestion: '如果先开口的是你，会发生什么？',
        weeklyPractice: '每天记录一个感受。',
      },
      provider: 'deepseek',
      model: 'deepseek-chat',
    },
    ...overrides,
  };
}

describeDb('探索记录仓储', () => {
  beforeAll(async () => {
    await prepareDatabase();
  });

  beforeEach(async () => {
    await resetData();
  });

  afterAll(async () => {
    await closePool();
  });

  it('保存后能读回，且对话内容一致', async () => {
    const subject = await resolveDevice('device-key-aaaaaaaaaaaaaaaa');
    const input = sampleInput();

    const { id } = await saveExploration(subject, input);
    const detail = await getExploration(subject, id);

    expect(detail).not.toBeNull();
    expect(detail!.rounds).toEqual(input.rounds);
    expect(detail!.report?.prose.coreObservations).toBe(
      input.report!.prose.coreObservations
    );
    expect(detail!.themes).toEqual(['关系', '距离']);
  });

  it('对话内容在数据库里是不可读的密文', async () => {
    // 这是整套隐私设计的验收点：脱库也读不出用户说过的话。
    const subject = await resolveDevice('device-key-bbbbbbbbbbbbbbbb');
    const secret = '这句话不应该以明文出现在数据库里';

    await saveExploration(
      subject,
      sampleInput({ rounds: [{ question: '问', answer: secret }] })
    );

    const row = await queryOne<{ rounds_cipher: Buffer }>(
      'SELECT rounds_cipher FROM explorations LIMIT 1'
    );

    expect(row).not.toBeNull();
    expect(row!.rounds_cipher.toString('utf8')).not.toContain(secret);
  });

  it('同一个 clientId 重复上传不会产生两条记录', async () => {
    // 前端网络重试、用户重复点击都会走到这里，必须幂等。
    const subject = await resolveDevice('device-key-cccccccccccccccc');
    const input = sampleInput({ clientId: 'fixed-client-id' });

    const first = await saveExploration(subject, input);
    const second = await saveExploration(subject, input);

    expect(second.id).toBe(first.id);
    const { total } = await listExplorations(subject);
    expect(total).toBe(1);
  });

  it('重复上传会覆盖报告，而不是留下旧主题', async () => {
    const subject = await resolveDevice('device-key-dddddddddddddddd');
    const input = sampleInput({ clientId: 'same-id' });

    await saveExploration(subject, input);
    await saveExploration(subject, {
      ...input,
      report: { ...input.report!, themes: ['成长'] },
    });

    const { items } = await listExplorations(subject);
    expect(items[0]!.themes).toEqual(['成长']);
  });

  it('AI 输出重复主题时不会因主键冲突而失败', async () => {
    // report_themes 的主键是 (report_id, theme)，重复主题必须先去重。
    const subject = await resolveDevice('device-key-eeeeeeeeeeeeeeee');
    const input = sampleInput();
    input.report!.themes = ['关系', '关系', '成长'];

    await expect(saveExploration(subject, input)).resolves.toBeDefined();

    const { items } = await listExplorations(subject);
    expect(items[0]!.themes).toEqual(['关系', '成长']);
  });

  it('列表不解密正文，只给摘要和主题', async () => {
    const subject = await resolveDevice('device-key-ffffffffffffffff');
    await saveExploration(subject, sampleInput());

    const { items } = await listExplorations(subject);
    expect(items).toHaveLength(1);
    expect(items[0]!.roundCount).toBe(2);
    expect(items[0]).not.toHaveProperty('rounds');
  });

  it('留言能写入并读回', async () => {
    const subject = await resolveDevice('device-key-1111111111111111');
    const { id } = await saveExploration(subject, sampleInput());

    const ok = await updateNote(subject, id, '今天想对自己温柔一点。');
    expect(ok).toBe(true);

    const detail = await getExploration(subject, id);
    expect(detail!.note).toBe('今天想对自己温柔一点。');
    expect(detail!.hasNote).toBe(true);
  });

  it('成长统计基于主题聚合', async () => {
    const subject = await resolveDevice('device-key-2222222222222222');

    await saveExploration(subject, sampleInput({ clientId: 'a' }));
    const second = sampleInput({ clientId: 'b' });
    second.report!.themes = ['关系', '成长'];
    await saveExploration(subject, second);

    const growth = await getGrowth(subject);
    expect(growth.sessions).toBe(2);

    const relation = growth.themeHistory.find((t) => t.theme === '关系');
    expect(relation?.count).toBe(2);
    expect(growth.lastExplored).not.toBeNull();
  });
});

describeDb('归属隔离', () => {
  beforeAll(async () => {
    await prepareDatabase();
  });

  beforeEach(async () => {
    await resetData();
  });

  afterAll(async () => {
    await closePool();
  });

  it('读不到别人的记录', async () => {
    // 越权访问必须查不到，而不是「查到了再判断」。
    const alice = await resolveDevice('device-alice-aaaaaaaaaaaa');
    const bob = await resolveDevice('device-bob-bbbbbbbbbbbbbb');

    const { id } = await saveExploration(alice, sampleInput());

    expect(await getExploration(bob, id)).toBeNull();
  });

  it('改不了别人的留言', async () => {
    const alice = await resolveDevice('device-alice-cccccccccccc');
    const bob = await resolveDevice('device-bob-dddddddddddddd');

    const { id } = await saveExploration(alice, sampleInput());

    expect(await updateNote(bob, id, '恶意改写')).toBe(false);
    const detail = await getExploration(alice, id);
    expect(detail!.note).toBeNull();
  });

  it('删不掉别人的记录', async () => {
    const alice = await resolveDevice('device-alice-eeeeeeeeeeee');
    const bob = await resolveDevice('device-bob-ffffffffffffff');

    const { id } = await saveExploration(alice, sampleInput());

    expect(await deleteExploration(bob, id)).toBe(false);
    expect(await getExploration(alice, id)).not.toBeNull();
  });

  it('别人的记录不出现在自己的列表和统计里', async () => {
    const alice = await resolveDevice('device-alice-111111111111');
    const bob = await resolveDevice('device-bob-222222222222');

    await saveExploration(alice, sampleInput());

    const { total } = await listExplorations(bob);
    expect(total).toBe(0);
    expect((await getGrowth(bob)).sessions).toBe(0);
  });
});

describeDb('账号与游客迁移', () => {
  beforeAll(async () => {
    await prepareDatabase();
  });

  beforeEach(async () => {
    await resetData();
  });

  afterAll(async () => {
    await closePool();
  });

  it('注册时把游客期间的探索迁移到账号', async () => {
    // 用户注册前作为游客做的探索不该凭空消失。
    const deviceKey = 'device-migrate-aaaaaaaaaaaa';
    const guest = await resolveDevice(deviceKey);

    await saveExploration(guest, sampleInput({ clientId: 'g1' }));
    await saveExploration(guest, sampleInput({ clientId: 'g2' }));

    const { subject: user, migrated } = await registerUser(
      'alice@example.com',
      'correct-horse-battery',
      deviceKey
    );

    expect(migrated).toBe(2);
    expect(user.type).toBe('user');

    // 新账号能看到这两条
    const { total } = await listExplorations(user);
    expect(total).toBe(2);
  });

  it('迁移后同一台设备不再以游客身份看到旧数据', async () => {
    // 否则同一台设备上会出现「账号里有、游客视角也有」的双份数据。
    const deviceKey = 'device-migrate-bbbbbbbbbbbb';
    const guest = await resolveDevice(deviceKey);
    await saveExploration(guest, sampleInput());

    await registerUser('bob@example.com', 'correct-horse-battery', deviceKey);

    // 同一个 deviceKey 再次解析，应当返回 user 身份而非 device
    const resolved = await resolveDevice(deviceKey);
    expect(resolved.type).toBe('user');
  });

  it('不带 deviceKey 注册不迁移任何数据', async () => {
    const guest = await resolveDevice('device-migrate-cccccccccccc');
    await saveExploration(guest, sampleInput());

    const { migrated } = await registerUser('carol@example.com', 'correct-horse-battery');
    expect(migrated).toBe(0);
  });

  it('邮箱重复注册报 409', async () => {
    await registerUser('dup@example.com', 'correct-horse-battery');
    await expect(
      registerUser('dup@example.com', 'another-password')
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('邮箱不区分大小写', async () => {
    // citext 列的作用：Alice@ 和 alice@ 是同一个账号。
    await registerUser('Mixed@Example.com', 'correct-horse-battery');
    await expect(
      registerUser('mixed@example.com', 'correct-horse-battery')
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('密码正确才能登录', async () => {
    await registerUser('login@example.com', 'correct-horse-battery');

    const subject = await loginUser('login@example.com', 'correct-horse-battery');
    expect(subject.type).toBe('user');

    await expect(loginUser('login@example.com', 'wrong-password')).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('密码以哈希形式存储，不含原文', async () => {
    const password = 'correct-horse-battery';
    await registerUser('hash@example.com', password);

    const row = await queryOne<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE email = $1',
      ['hash@example.com']
    );

    expect(row!.password_hash).not.toContain(password);
    expect(row!.password_hash.startsWith('$argon2id$')).toBe(true);
  });

  it('不存在的邮箱登录也报 401（不泄漏邮箱是否注册）', async () => {
    await expect(
      loginUser('nobody@example.com', 'whatever-password')
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

describeDb('token 生命周期', () => {
  beforeAll(async () => {
    await prepareDatabase();
  });

  beforeEach(async () => {
    await resetData();
  });

  afterAll(async () => {
    await closePool();
  });

  it('签发的访问 token 能被校验出正确身份', async () => {
    const subject = await resolveDevice('device-token-aaaaaaaaaaaa');
    const tokens = await issueTokens(subject);

    const verified = await verifyAccessToken(tokens.accessToken);
    expect(verified).toEqual(subject);
  });

  it('伪造的 token 校验失败', async () => {
    expect(await verifyAccessToken('not-a-real-token')).toBeNull();
    expect(await verifyAccessToken('')).toBeNull();
  });

  it('刷新后拿到新 token，旧的立即失效', async () => {
    // 轮换策略：刷新 token 泄漏后，攻击者用过一次合法用户就会察觉。
    const subject = await resolveDevice('device-token-bbbbbbbbbbbb');
    const first = await issueTokens(subject);

    const second = await rotateTokens(first.refreshToken);
    expect(second).not.toBeNull();
    expect(second!.refreshToken).not.toBe(first.refreshToken);

    // 旧的不能再用
    expect(await rotateTokens(first.refreshToken)).toBeNull();
  });

  it('登出后刷新 token 失效', async () => {
    const subject = await resolveDevice('device-token-cccccccccccc');
    const tokens = await issueTokens(subject);

    await revokeToken(tokens.refreshToken);
    expect(await rotateTokens(tokens.refreshToken)).toBeNull();
  });

  it('刷新 token 以哈希形式入库，不含原文', async () => {
    const subject = await resolveDevice('device-token-dddddddddddd');
    const tokens = await issueTokens(subject);

    const rows = await query<{ refresh_hash: string }>(
      'SELECT refresh_hash FROM auth_tokens'
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.refresh_hash).not.toBe(tokens.refreshToken);
    expect(rows[0]!.refresh_hash).not.toContain(tokens.refreshToken);
  });

  it('过期的刷新 token 不能用', async () => {
    const subject = await resolveDevice('device-token-eeeeeeeeeeee');
    const tokens = await issueTokens(subject);

    // 直接把过期时间改到过去，模拟 30 天后
    await query('UPDATE auth_tokens SET expires_at = now() - interval \'1 day\'');
    expect(await rotateTokens(tokens.refreshToken)).toBeNull();
  });
});
