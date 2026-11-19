import { NextRequest, NextResponse } from 'next/server';
import { accessGateEnabled, checkAccessCode, issueAccessCookie } from '@/lib/accessCode';
import { consume } from '@/lib/rateLimit';

/** 与 aiGuard 同一套取 IP 逻辑：x-forwarded-for 的第一段是最初客户端。 */
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * 输入访问口令换取通行 cookie。
 *
 * 防爆破：同一 IP 10 分钟内最多试 10 次。口令本身建议设置得长一些
 * （见部署说明），配合这里的限流，穷举在现实中不可行。
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!accessGateEnabled()) {
    return NextResponse.json({ ok: true });
  }

  const ip = clientIp(request);
  const limit = consume(`unlock:ip:${ip}`, 10, 10 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `尝试次数太多，请 ${Math.ceil(limit.retryAfterSeconds / 60)} 分钟后再试。`, code: 'RATE_LIMITED' },
      { status: 429 }
    );
  }

  let code: unknown = '';
  try {
    code = ((await request.json()) as { code?: unknown })?.code;
  } catch {
    // 请求体为空或不是 JSON：按口令错误处理
  }

  if (!checkAccessCode(code)) {
    return NextResponse.json({ error: '口令不正确，请确认后重试。', code: 'BAD_CODE' }, { status: 403 });
  }

  const cookie = issueAccessCookie();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
