import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backendProxy';

/** 探索记录列表与上传：/api/explorations → 后端 /explorations */

export async function GET(request: NextRequest): Promise<Response> {
  return proxyToBackend(request, '/explorations');
}

export async function POST(request: NextRequest): Promise<Response> {
  return proxyToBackend(request, '/explorations');
}
