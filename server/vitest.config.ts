import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 注入测试用环境变量。env.ts 会校验格式，所以这些值必须是合法的
    // 64 位十六进制，不能随便填。
    setupFiles: ['./src/test/setup.ts'],
    // 数据库测试之间会互相干扰（共用一个库），所以串行跑。
    fileParallelism: false,
    include: ['src/**/*.test.ts'],
  },
});
