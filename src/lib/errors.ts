/**
 * 错误处理工具。
 *
 * 为什么需要它：OpenAI / Anthropic SDK 抛出的错误对象上常常挂着完整的请求配置，
 * 其中包含 Authorization 头。直接 `console.error(error)` 会把 API Key 打进日志
 * （Vercel 日志、终端输出都算），在「用户自带 key」模式下这就是一次凭据泄漏。
 * 因此任何时候都只记录 message 和状态码，绝不记录整个对象。
 *
 * 第二层防护：上游返回的 message 文本本身也可能带上凭据（某些服务商会把
 * 请求参数原样写进错误文案）。所以无论进日志还是回给浏览器，都先过一遍
 * `sanitizeMessage`——把形似密钥的串替换掉，并限制长度。
 */

/** 形似 API Key 的串：sk- 开头、后接足够长的字母数字。 */
const SECRET_LIKE = /sk-[A-Za-z0-9_-]{8,}/g;

/** 单条错误文案的最大长度，防止上游返回一大段原文。 */
const MAX_MESSAGE_LENGTH = 200;

/** 抹掉疑似凭据、压平空白、限制长度。 */
export function sanitizeMessage(message: string): string {
  return message
    .replace(SECRET_LIKE, '[已隐藏]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

/** 从未知错误里安全地取出可读信息，不触碰可能含凭据的字段。 */
export function describeError(error: unknown): { message: string; status?: number } {
  if (error instanceof Error) {
    // SDK 的错误类通常带 status / statusCode，取到就一起记，便于排查。
    const status = (error as { status?: number; statusCode?: number }).status
      ?? (error as { status?: unknown; statusCode?: number }).statusCode;
    return {
      message: String(error.message ?? ''),
      status: typeof status === 'number' ? status : undefined,
    };
  }
  if (typeof error === 'string') return { message: error };
  return { message: '未知错误' };
}

/** 记录一条不含凭据的错误日志。 */
export function logError(scope: string, error: unknown): void {
  const { message, status } = describeError(error);
  console.error(`[${scope}] ${status ? `HTTP ${status} · ` : ''}${sanitizeMessage(message)}`);
}

/** 取出可以安全返回给前端的错误文案。 */
export function toClientMessage(error: unknown, fallback: string): string {
  const { message } = describeError(error);
  const clean = sanitizeMessage(message);
  return clean || fallback;
}
