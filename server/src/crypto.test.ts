import { describe, it, expect } from 'vitest';
import { seal, open, sealJson, openJson, hashToken, generateToken, safeCompare } from './crypto.js';

describe('内容加密', () => {
  it('加密后能原样解出来', () => {
    const text = '我看到两个人背对背站着，中间有雾。';
    const sealed = seal(text);
    expect(open(sealed)).toBe(text);
  });

  it('密文不包含明文片段', () => {
    // 这是加密的意义所在：脱库拿到 bytea 也读不出内容。
    const text = '这段话很敏感';
    const sealed = seal(text);
    expect(sealed.cipher.toString('utf8')).not.toContain(text);
    expect(sealed.cipher.toString('hex')).not.toContain(Buffer.from(text).toString('hex'));
  });

  it('每次加密用不同的 IV，相同明文产出不同密文', () => {
    // IV 复用会让相同明文产生相同密文，从而泄漏「这两条记录内容一样」。
    const a = seal('同样的话');
    const b = seal('同样的话');
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.cipher.equals(b.cipher)).toBe(false);
  });

  it('密文被篡改时解密失败而非解出错误明文', () => {
    // 选 GCM 而非 CBC 的理由：篡改会被 authTag 检测到。
    const sealed = seal('原始内容');
    const tampered = Buffer.from(sealed.cipher);
    tampered[0] = (tampered[0]! ^ 0xff) & 0xff;

    expect(() => open({ ...sealed, cipher: tampered })).toThrow();
  });

  it('authTag 被替换时解密失败', () => {
    const sealed = seal('原始内容');
    const badTag = Buffer.alloc(sealed.tag.length, 0);
    expect(() => open({ ...sealed, tag: badTag })).toThrow();
  });

  it('JSON 往返保持结构', () => {
    const rounds = [
      { question: '你首先注意到了什么？', answer: '雾里有个人。' },
      { question: '那个人在做什么？', answer: '好像在等谁。' },
    ];
    const sealed = sealJson(rounds);
    expect(openJson<typeof rounds>(sealed)).toEqual(rounds);
  });

  it('空字符串和多字节字符都能正确往返', () => {
    expect(open(seal(''))).toBe('');
    const emoji = '🌫️ 雾 · こんにちは · Ω';
    expect(open(seal(emoji))).toBe(emoji);
  });

  it('很长的文本也能往返', () => {
    // 6 轮对话每轮几千字是可能的，不能有长度上的隐性截断。
    const long = '很长的回答。'.repeat(5000);
    expect(open(seal(long))).toBe(long);
  });
});

describe('token 哈希', () => {
  it('同一个 token 哈希结果稳定', () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('不同 token 哈希不同', () => {
    expect(hashToken(generateToken())).not.toBe(hashToken(generateToken()));
  });

  it('哈希值里不含原文', () => {
    // 刷新 token 必须哈希后入库——明文入库等于把长期凭据留在数据库里。
    const token = generateToken();
    expect(hashToken(token)).not.toContain(token);
  });

  it('生成的 token 足够长且各不相同', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken()));
    expect(tokens.size).toBe(100);
    for (const t of tokens) expect(t.length).toBeGreaterThanOrEqual(40);
  });
});

describe('恒定时间比较', () => {
  it('相同字符串返回 true', () => {
    expect(safeCompare('abc123', 'abc123')).toBe(true);
  });

  it('不同字符串返回 false', () => {
    expect(safeCompare('abc123', 'abc124')).toBe(false);
  });

  it('长度不同返回 false 而不抛错', () => {
    // timingSafeEqual 对不等长输入会抛错，必须先比长度。
    expect(safeCompare('short', 'much-longer-string')).toBe(false);
  });

  it('空字符串不会崩', () => {
    expect(safeCompare('', '')).toBe(true);
    expect(safeCompare('', 'x')).toBe(false);
  });
});
