import { NextRequest, NextResponse } from 'next/server';
import { callAI, AIConfig } from '@/lib/aiProvider';

export async function POST(request: NextRequest) {
  try {
    const { settings } = await request.json() as { settings: AIConfig };

    if (!settings?.apiKey) {
      return NextResponse.json({ ok: false, error: '请输入 API Key' });
    }

    await callAI(settings, '你是助手。', [{ role: 'user', content: '你好' }], 10);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '连接失败';
    return NextResponse.json({ ok: false, error: message });
  }
}
