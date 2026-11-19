import { NextRequest, NextResponse } from 'next/server';
import { generateReport } from '@/lib/claude';
import { AIConfig } from '@/lib/aiProvider';
import { getServerAIConfig } from '@/lib/serverConfig';
import { logError, toClientMessage } from '@/lib/errors';
import { guardAIRequest } from '@/lib/aiGuard';
import { Round } from '@/types';

// 报告生成是最慢的一步（推理 + 长输出），显式放宽执行上限。
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { settings, imageDescription, rounds } = await request.json() as {
      settings?: AIConfig;
      imageDescription: string;
      rounds: Round[];
    };

    const aiConfig = getServerAIConfig(settings);

    if (!aiConfig?.apiKey) {
      return NextResponse.json({ error: '请先配置 API Key' }, { status: 400 });
    }

    const guard = await guardAIRequest(request, 'session/complete', !settings?.apiKey);
    if (guard.response) return guard.response;

    const report = await generateReport(aiConfig, imageDescription, rounds);
    return NextResponse.json({ report });
  } catch (error) {
    logError('session/complete', error);
    return NextResponse.json(
      { error: toClientMessage(error, '报告生成失败，请重试。') },
      { status: 500 }
    );
  }
}
