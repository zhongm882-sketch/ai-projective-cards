import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backendProxy';

/** 单条探索记录：/api/explorations/:id → 后端 /explorations/:id */

// Next.js 15 起动态路由的 params 是 Promise，必须 await。
type Ctx = { params: Promise<{ id: string }> };

/** 只允许 UUID，防止路径里塞进 ../ 之类的东西拼出别的后端接口。 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveId(ctx: Ctx): Promise<string | null> {
  const { id } = await ctx.params;
  return UUID.test(id) ? id : null;
}

export async function GET(request: NextRequest, ctx: Ctx): Promise<Response> {
  const id = await resolveId(ctx);
  if (!id) return Response.json({ error: '记录 ID 不合法' }, { status: 400 });
  return proxyToBackend(request, `/explorations/${id}`);
}

export async function DELETE(request: NextRequest, ctx: Ctx): Promise<Response> {
  const id = await resolveId(ctx);
  if (!id) return Response.json({ error: '记录 ID 不合法' }, { status: 400 });
  return proxyToBackend(request, `/explorations/${id}`);
}
