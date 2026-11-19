import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backendProxy';

/** 成长轨迹：/api/growth → 后端 /growth */

export async function GET(request: NextRequest): Promise<Response> {
  return proxyToBackend(request, '/growth');
}
