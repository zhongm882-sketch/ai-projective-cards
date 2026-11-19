import { NextRequest, NextResponse } from 'next/server';
import { accessGateEnabled, hasValidAccess } from '@/lib/accessCode';

/** 查询当前访问是否需要口令、以及本浏览器是否已通过。 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return NextResponse.json({
    required: accessGateEnabled(),
    granted: hasValidAccess(request),
  });
}
