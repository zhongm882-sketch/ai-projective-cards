import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/errors';

/**
 * 后端转发层。
 *
 * 浏览器 → Next.js → Fastify 后端。Next.js 这一层很薄，只做三件事：
 *   1. 把浏览器的 cookie 透传给后端（后端同时接受 cookie 和 Bearer）
 *   2. 把后端的 Set-Cookie 透传回浏览器
 *   3. 后端不可用时给出明确的状态码，让前端能降级
 *
 * 为什么要这一跳：token 存在 httpOnly cookie 里，浏览器 JS 读不到，
 * 页面上即使有 XSS 也偷不走凭据。而 cookie 只会发给同源地址，
 * 所以需要同源的 Next.js 来接收再转发。
 */

/** 后端地址。没配就说明还没接后端，相关功能整体降级。 */
export const BACKEND_URL = process.env.BACKEND_URL?.replace(/\/$/, '') ?? '';

export const backendConfigured = BACKEND_URL.length > 0;

/** 后端不可用时的统一响应。503 让前端知道「不是你的问题，稍后再试」。 */
function backendUnavailable(): NextResponse {
  return NextResponse.json(
    { error: '同步服务暂时不可用，你的记录已保存在本地。' },
    { status: 503 }
  );
}

/**
 * 问后端「这个请求是谁发的」。
 *
 * 和 proxyToBackend 的区别：这个不是转发给浏览器看的，而是服务端内部
 * 拿来做决策的（要不要放行一次 AI 调用、按谁限流）。
 * 后端是身份的唯一真相来源，Next.js 这层不自己验签——
 * 否则 JWT 密钥要在两处各存一份，改一处漏一处。
 *
 * 返回 null 表示「没有身份」或「后端没答上来」，调用方自己决定怎么处理。
 */
export interface BackendIdentity {
  type: 'user' | 'guest';
  /**
   * 身份的稳定引用值，由后端 HMAC 派生。
   * 用作限流 key：对同一身份恒定，但不是数据库主键，泄漏了也没有查询价值。
   */
  key: string;
}

export async function resolveBackendIdentity(
  request: NextRequest
): Promise<BackendIdentity | null> {
  if (!backendConfigured) return null;

  const cookie = request.headers.get('cookie');
  if (!cookie) return null;

  try {
    const res = await fetch(`${BACKEND_URL}/auth/me`, {
      headers: { cookie },
      // 比转发层的 10 秒短得多：这只是一次内网查询，
      // 而它挡在 AI 调用前面，慢一秒用户就多等一秒。
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return null;

    const body = (await res.json()) as {
      identity?: { type?: string; ref?: string } | null;
    };
    const identity = body.identity;
    // 必须有 ref：没有它就没法按身份计数，退回「所有人共享一份配额」
    // 反而会误伤正常用户。这种情况说明后端版本不匹配，当作没身份处理。
    if (!identity?.ref) return null;
    if (identity.type === 'user') return { type: 'user', key: identity.ref };
    if (identity.type === 'guest') return { type: 'guest', key: identity.ref };
    return null;
  } catch (error) {
    logError('resolveBackendIdentity', error);
    return null;
  }
}

/**
 * 转发一个请求到后端。
 *
 * @param request 原始请求
 * @param path    后端路径，如 '/explorations'
 */
export async function proxyToBackend(
  request: NextRequest,
  path: string
): Promise<NextResponse> {
  if (!backendConfigured) return backendUnavailable();

  const url = new URL(request.url);
  const target = `${BACKEND_URL}${path}${url.search}`;

  const headers = new Headers();
  headers.set('content-type', 'application/json');

  // 透传 cookie，后端的鉴权钩子会从里面取访问 token
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);

  // 让后端能记录真实来源 IP（它按身份或 IP 限流）
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) headers.set('x-forwarded-for', forwardedFor);

  let body: string | undefined;
  if (request.method !== 'GET' && request.method !== 'DELETE') {
    body = await request.text();
  }

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      // 后端在内网或本机，10 秒足够；超时比一直挂着好。
      signal: AbortSignal.timeout(10_000),
      // 后端不应该返回重定向，自己处理反而会掩盖配置错误
      redirect: 'manual',
    });

    const text = await upstream.text();
    const response = new NextResponse(text, {
      status: upstream.status,
      headers: { 'content-type': 'application/json' },
    });

    // 把后端下发的 cookie 透传回浏览器。
    // getSetCookie() 能拿到多个 Set-Cookie（访问 + 刷新两个），
    // 用 headers.get('set-cookie') 只能拿到被合并的一条，会丢 cookie。
    for (const value of upstream.headers.getSetCookie()) {
      response.headers.append('set-cookie', value);
    }

    return response;
  } catch (error) {
    // 后端没启动、网络不通、超时都会走到这里。
    // 这是预期内的情况（用户可能只想本地用），所以记 warn 级别的信息即可。
    logError('backendProxy', error);
    return backendUnavailable();
  }
}
