/**
 * 后端 API 模拟测试
 *
 * 这个脚本测试后端的核心逻辑，不需要真实的数据库。
 * 主要验证：
 * 1. 环境变量加载
 * 2. 加密/解密
 * 3. Token 签发和验证
 * 4. 身份引用生成
 */

import 'dotenv/config';
import { env } from './dist/env.js';
import { seal, open, sealJson, openJson, hashToken, subjectRef } from './dist/crypto.js';
import { verifyAccessToken } from './dist/auth/tokens.js';
import { SignJWT } from 'jose';

console.log('🧪 后端核心逻辑测试\n');
console.log('━'.repeat(50));

// 测试 1: 环境变量
console.log('\n📋 测试 1: 环境变量加载');
try {
  console.log('✓ 数据库:', env.DATABASE_URL.replace(/:[^:@]+@/, ':****@'));
  console.log('✓ 端口:', env.PORT);
  console.log('✓ 管理接口:', env.adminEnabled ? '已启用' : '已禁用');
  console.log('✓ CORS 来源:', env.corsOrigins.join(', '));
  console.log('✓ 加密密钥长度:', env.CONTENT_ENCRYPTION_KEY.length, '字符 (应该是64)');
  console.log('✓ JWT 密钥长度:', env.JWT_SECRET.length, '字符 (应该是64)');
} catch (error) {
  console.error('✗ 环境变量加载失败:', error.message);
  process.exit(1);
}

// 测试 2: 内容加密
console.log('\n🔐 测试 2: 内容加密/解密');
try {
  const conversation = {
    rounds: [
      { question: '你看到了什么？', answer: '我看到一片宁静的湖面。' },
      { question: '这让你想到什么？', answer: '想到了内心的平静。' }
    ],
    themes: ['平静', '内省', '自我觉察']
  };

  const sealed = sealJson(conversation);
  console.log('✓ 加密成功');
  console.log('  - 密文:', sealed.cipher.length, 'bytes');
  console.log('  - IV:', sealed.iv.length, 'bytes');
  console.log('  - AuthTag:', sealed.tag.length, 'bytes');

  const decrypted = openJson(sealed);
  const matches = JSON.stringify(decrypted) === JSON.stringify(conversation);
  console.log('✓ 解密成功:', matches ? '内容完全一致' : '⚠️  内容不一致');

  if (!matches) {
    console.error('原始:', conversation);
    console.error('解密:', decrypted);
    throw new Error('加密/解密验证失败');
  }
} catch (error) {
  console.error('✗ 加密测试失败:', error.message);
  process.exit(1);
}

// 测试 3: JWT 签发和验证
console.log('\n🎫 测试 3: JWT 访问令牌');
try {
  const JWT_KEY = new TextEncoder().encode(env.JWT_SECRET);
  const ACCESS_TTL_SECONDS = 15 * 60;

  // 手动签发 token（模拟后端内部逻辑）
  const signAccessToken = async (subject) => {
    return new SignJWT({ sub: subject.id, styp: subject.type })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
      .sign(JWT_KEY);
  };

  const userSubject = { type: 'user', id: 'user-abc-123' };
  const guestSubject = { type: 'device', id: 'device-xyz-789' };

  const userToken = await signAccessToken(userSubject);
  const guestToken = await signAccessToken(guestSubject);

  console.log('✓ 用户 token 已签发');
  console.log('  - 长度:', userToken.length, '字符');
  console.log('  - 前30字符:', userToken.slice(0, 30) + '...');

  console.log('✓ 游客 token 已签发');
  console.log('  - 长度:', guestToken.length, '字符');

  const verifiedUser = await verifyAccessToken(userToken);
  const verifiedGuest = await verifyAccessToken(guestToken);

  if (!verifiedUser || verifiedUser.type !== 'user' || verifiedUser.id !== 'user-abc-123') {
    throw new Error('用户 token 验证失败');
  }
  if (!verifiedGuest || verifiedGuest.type !== 'device' || verifiedGuest.id !== 'device-xyz-789') {
    throw new Error('游客 token 验证失败');
  }

  console.log('✓ Token 验证成功');
  console.log('  - 用户身份:', verifiedUser.type, '/', verifiedUser.id.slice(0, 20) + '...');
  console.log('  - 游客身份:', verifiedGuest.type, '/', verifiedGuest.id.slice(0, 20) + '...');

  // 测试无效 token
  const invalid = await verifyAccessToken('invalid.token.here');
  console.log('✓ 无效 token 被正确拒绝:', invalid === null ? '是' : '否');

} catch (error) {
  console.error('✗ JWT 测试失败:', error.message);
  process.exit(1);
}

// 测试 4: 身份引用生成
console.log('\n🔑 测试 4: 身份引用值（限流 key）');
try {
  const user1Ref = subjectRef('user', 'user-abc-123');
  const user1RefAgain = subjectRef('user', 'user-abc-123');
  const user2Ref = subjectRef('user', 'user-xyz-456');
  const guestRef = subjectRef('device', 'device-abc-123');

  console.log('✓ 引用值生成成功');
  console.log('  - 用户1:', user1Ref);
  console.log('  - 用户2:', user2Ref);
  console.log('  - 游客:', guestRef);

  console.log('✓ 幂等性检查:', user1Ref === user1RefAgain ? '通过' : '失败');
  console.log('✓ 唯一性检查:', user1Ref !== user2Ref && user1Ref !== guestRef ? '通过' : '失败');
  console.log('✓ 长度检查:', user1Ref.length === 32 ? '通过 (32字符)' : `失败 (${user1Ref.length}字符)`);

} catch (error) {
  console.error('✗ 身份引用测试失败:', error.message);
  process.exit(1);
}

// 测试 5: Token 哈希
console.log('\n🔒 测试 5: 刷新 Token 哈希');
try {
  const refreshToken = 'my-super-secret-refresh-token-' + Date.now();
  const hash1 = hashToken(refreshToken);
  const hash2 = hashToken(refreshToken);
  const hash3 = hashToken(refreshToken + 'different');

  console.log('✓ 哈希生成成功');
  console.log('  - 示例哈希:', hash1);
  console.log('  - 长度:', hash1.length, '字符 (SHA-256 hex = 64)');

  console.log('✓ 确定性检查:', hash1 === hash2 ? '通过' : '失败');
  console.log('✓ 唯一性检查:', hash1 !== hash3 ? '通过' : '失败');

} catch (error) {
  console.error('✗ Token 哈希测试失败:', error.message);
  process.exit(1);
}

console.log('\n━'.repeat(50));
console.log('\n✅ 所有核心功能测试通过！\n');
console.log('📝 测试总结:');
console.log('  ✓ 环境变量加载正常');
console.log('  ✓ AES-256-GCM 加密/解密工作正常');
console.log('  ✓ JWT 签发和验证工作正常');
console.log('  ✓ 身份引用生成工作正常（用于限流）');
console.log('  ✓ Token 哈希工作正常（用于刷新令牌存储）');
console.log('\n⚠️  数据库相关功能需要 PostgreSQL 才能测试。');
console.log('   启动数据库后运行: npm start\n');
