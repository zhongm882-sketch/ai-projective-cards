import { NextResponse } from 'next/server';
import { backendConfigured } from '@/lib/backendProxy';

export async function GET() {
  const hasServerConfig = !!process.env.AI_API_KEY?.trim();
  // 前端据此决定是否尝试同步到后端。没接后端时纯本地运行，不该反复请求失败。
  return NextResponse.json({ hasServerConfig, syncEnabled: backendConfigured });
}
