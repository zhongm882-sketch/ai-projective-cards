/**
 * 测试环境变量注入。
 *
 * env.ts 会严格校验格式（缺失或非法就抛错），所以这里填的必须是
 * 合法的 64 位十六进制，不能随便写。
 *
 * 这些值只用于测试：加密测试验证的是「加进去能解出来」，
 * 与具体密钥值无关。
 */

process.env.CONTENT_ENCRYPTION_KEY ??=
  '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
process.env.JWT_SECRET ??=
  'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100';
process.env.NODE_ENV = 'test';

// 没有配测试数据库时给一个占位串，让不碰数据库的单元测试仍能跑起来。
// 需要数据库的测试会自行跳过（见 db.test.ts）。
process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/projective_test';
