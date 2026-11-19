import 'dotenv/config';
import { z } from 'zod';

/**
 * 环境变量校验。
 *
 * 原则：缺失或格式错误就让进程启动失败，绝不静默降级。
 * 加密密钥配错而服务还能跑起来，是最坏的情况——数据会以错误的方式落库，
 * 等发现时已经无法恢复。
 */

/** 64 位十六进制 = 32 字节，AES-256 与 HMAC 都要求这个长度。 */
const hex32Bytes = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, '必须是 64 位十六进制字符（32 字节）');

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL 不能为空'),
  CONTENT_ENCRYPTION_KEY: hex32Bytes,
  JWT_SECRET: hex32Bytes,
  // 留空表示彻底关闭管理接口，这比配一个弱口令安全。
  ADMIN_TOKEN: z.string().min(16, 'ADMIN_TOKEN 至少 16 个字符').optional().or(z.literal('')),
  CORS_ORIGINS: z.string().default('http://localhost:3001'),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

function loadEnv() {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    // 这里故意用中文直接说明怎么修，避免只丢一个 zod 堆栈。
    throw new Error(
      `环境变量配置有误，服务无法启动：\n${details}\n\n` +
        '请参照 server/.env.example 补齐。生成密钥：\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  const env = parsed.data;

  return {
    ...env,
    isProduction: env.NODE_ENV === 'production',
    /** 允许的前端来源列表 */
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    /** 只有配了足够长的 ADMIN_TOKEN 才启用管理接口 */
    adminEnabled: Boolean(env.ADMIN_TOKEN && env.ADMIN_TOKEN.length >= 16),
  };
}

export const env = loadEnv();
export type Env = typeof env;
