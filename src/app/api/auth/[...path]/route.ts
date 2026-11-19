import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backendProxy';

/**
 * 鉴权接口转发：/api/auth/* → 后端 /auth/*
 *
 * 只放行明确列出的路径。用白名单而不是无脑转发，
 * 是为了避免以后后端加了内部接口后被从浏览器直接触达。
 */

const ALLOWED = new Set(['guest', 'register', 'login', 'refresh', 'logout', 'me']);

// Next.js 15 起动态路由的 params 是 Promise，必须 await。
async function handle(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path } = await ctx.params;
  const segment = path[0];

  if (path.length !== 1 || !segment || !ALLOWED.has(segment)) {
    return Response.json({ error: '接口不存在' }, { status: 404 });
  }

  return proxyToBackend(request, `/auth/${segment}`);
}

export const POST = handle;
export const GET = handle;
