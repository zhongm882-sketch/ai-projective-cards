import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { backendConfigured, resolveBackendIdentity } from '@/lib/backendProxy';
import { consume } from '@/lib/rateLimit';
import { accessGateEnabled, hasValidAccess } from '@/lib/accessCode';

/**
 * AI 路由的准入检查。
 *
 * 要解决的问题：如果服务端配了自己的 API Key（AI_API_KEY），那么任何人
 * 只要知道域名，直接往 /api/session/respond 发 POST 就能白嫖 AI 额度。
 * 没有身份、没有限流，账单是你的。
 *
 * 四层规则，按成本归属决定严格程度：
 *
 *   0. 花服务端钱时，先过「访问口令门」（配置 ACCESS_CODE 后生效）。
 *      没有口令的请求一律 403，前端据此弹出输码框。这是最外层的闸门，
 *      能挡住所有陌生人和扫描器——口令没泄露，就不存在被白嫖。
 *
 *   1. 用户自带 key（请求里带了 settings.apiKey）→ 不拦，也不要求口令。
 *      花的是他自己的钱，我们没有立场限制，也没有成本风险。
 *
 *   2. 用服务端 key + 已接后端 → 要求有效身份（游客 token 也算）。
 *      游客身份零摩擦（首次访问自动获取），但请求从此可归因。
 *
 *   3. 限流同时按「身份」和「IP」双重计数。只按身份的话，
 *      换一个游客身份就等于刷新全部配额；加上 IP 维度，刷身份不再有意义。
 *      IP 配额放宽 2 倍，避免同一 WiFi 下的正常用户互相挤占。
 */

/** 各接口的配额。报告生成最贵，卡得最紧。 */
const LIMITS = {
  'session/start': { max: 20, windowMs: 10 * 60_000 },
  'session/respond': { max: 60, windowMs: 10 * 60_000 },
  'session/complete': { max: 15, windowMs: 10 * 60_000 },
} as const;

export type AIRoute = keyof typeof LIMITS;

/** 跨接口的总量上限：防止有人把三个接口各刷到上限凑出一大笔账单。 */
const AGGREGATE = { max: 80, windowMs: 60 * 60_000 };

/** IP 维度配额的放宽倍数（同一个出口 IP 后面通常是多人/多设备）。 */
const IP_LIMIT_FACTOR = 2;

/**
 * 取客户端 IP。
 *
 * Next.js 的 request 上没有直接的 ip 字段（不同平台注入方式不同），
 * 统一从 x-forwarded-for 的第一段取——那是最初的客户端地址，
 * 后面几段是各级代理。取不到就用一个固定值，等于「所有匿名请求共享一份配额」，
 * 保守但安全。
 */
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  if (first) return first;
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** 某个计数维度对应的配额倍数。 */
function factorOf(subject: string): number {
  return subject.startsWith('ip:') ? IP_LIMIT_FACTOR : 1;
}

export interface GuardResult {
  /** 不为 null 时直接把它返回给客户端，不要继续调用 AI */
  response: NextResponse | null;
}

/**
 * 检查一次 AI 调用是否放行。
 *
 * @param request       原始请求
 * @param route         哪个接口，决定用哪份配额
 * @param usesServerKey 是否在花服务端的钱。调用方用「请求里有没有带自己的 apiKey」判断。
 */
export async function guardAIRequest(
  request: NextRequest,
  route: AIRoute,
  usesServerKey: boolean
): Promise<GuardResult> {
  // 规则 1：用户自带 key，直接放行。
  if (!usesServerKey) return { response: null };

  // 规则 0：访问口令门。
  if (accessGateEnabled() && !hasValidAccess(request)) {
    return {
      response: NextResponse.json(
        {
          error: '需要访问口令才能使用，请输入后重试。',
          // 前端据此弹出口令输入框，输对后自动重试
          code: 'ACCESS_REQUIRED',
        },
        { status: 403 }
      ),
    };
  }

  // 规则 2/3：确定这一笔请求要计入哪些维度。
  const subjects: string[] = [];

  if (backendConfigured) {
    const identity = await resolveBackendIdentity(request);
    if (!identity) {
      return {
        response: NextResponse.json(
          {
            error: '会话身份已失效，请刷新页面后重试。',
            // 前端据此自动调 /api/auth/guest 换一个身份再重试，
            // 而不是把这句话直接怼给用户看。
            code: 'IDENTITY_REQUIRED',
          },
          { status: 401 }
        ),
      };
    }
    subjects.push(`id:${identity.key}`);
  }

  // IP 维度始终参与计数：只有它能防住「换身份刷配额」。
  subjects.push(`ip:${clientIp(request)}`);

  // 先查总量，再查单接口。总量先查是因为它一旦触顶，
  // 单接口的计数就不该再被消耗（否则恢复后配额还是空的）。
  const deniedAggregate = subjects
    .map((s) => consume(`ai:all:${s}`, AGGREGATE.max * factorOf(s), AGGREGATE.windowMs))
    .find((r) => !r.allowed);
  if (deniedAggregate) {
    return { response: tooMany(deniedAggregate.retryAfterSeconds) };
  }

  const limit = LIMITS[route];
  const deniedRoute = subjects
    .map((s) => consume(`ai:${route}:${s}`, limit.max * factorOf(s), limit.windowMs))
    .find((r) => !r.allowed);
  if (deniedRoute) {
    return { response: tooMany(deniedRoute.retryAfterSeconds) };
  }

  return { response: null };
}

function tooMany(retryAfterSeconds: number): NextResponse {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return NextResponse.json(
    { error: `请求太频繁了，请在 ${minutes} 分钟后再试。`, code: 'RATE_LIMITED' },
    {
      status: 429,
      // 标准头，让客户端和中间层都能读到该等多久
      headers: { 'retry-after': String(retryAfterSeconds) },
    }
  );
}
