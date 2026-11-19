import { NextRequest, NextResponse } from 'next/server';
import { generateNextQuestion } from '@/lib/claude';
import { AIConfig } from '@/lib/aiProvider';
import { getServerAIConfig } from '@/lib/serverConfig';
import { logError, toClientMessage } from '@/lib/errors';
import { guardAIRequest } from '@/lib/aiGuard';
import { Round } from '@/types';

// 推理模型 + 多轮上下文可能超过 Vercel 默认的函数执行上限，显式放宽。
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { settings, imageDescription, rounds, roundIndex } = await request.json() as {
      settings?: AIConfig;
      imageDescription: string;
      rounds: Round[];
      roundIndex: number;
    };

    const aiConfig = getServerAIConfig(settings);

    if (!aiConfig?.apiKey) {
      return NextResponse.json({ error: '请先配置 API Key' }, { status: 400 });
    }

    const guard = await guardAIRequest(request, 'session/respond', !settings?.apiKey);
    if (guard.response) return guard.response;

    const result = await generateNextQuestion(aiConfig, imageDescription, rounds, roundIndex);
    return NextResponse.json(result);
  } catch (error) {
    logError('session/respond', error);
    return NextResponse.json(
      { error: toClientMessage(error, '生成问题失败，请重试。') },
      { status: 500 }
    );
  }
}
