import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backendProxy';

/** 留言更新：/api/explorations/:id/note → 后端 /explorations/:id/note */

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!UUID.test(id)) {
    return Response.json({ error: '记录 ID 不合法' }, { status: 400 });
  }
  return proxyToBackend(request, `/explorations/${id}/note`);
}
