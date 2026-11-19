import { NextRequest, NextResponse } from 'next/server';
import { generateProjectiveImage } from '@/lib/imageGeneration';
import { generateFirstQuestion } from '@/lib/claude';
import { AIConfig } from '@/lib/aiProvider';
import { getServerAIConfig } from '@/lib/serverConfig';
import { logError, toClientMessage } from '@/lib/errors';
import { guardAIRequest } from '@/lib/aiGuard';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    // recentCards：最近抽过的卡片路径，用于避免连续重复抽到同一张。
    const { settings, recentCards } = await request.json() as {
      settings?: AIConfig;
      recentCards?: string[];
    };

    const aiConfig = getServerAIConfig(settings);

    if (!aiConfig?.apiKey) {
      return NextResponse.json({ error: '请先配置 API Key' }, { status: 400 });
    }

    // 花服务端的钱时才需要准入检查。判断依据是「请求里有没有带自己的 key」，
    // 而不是 aiConfig 里最终有没有 key——后者两种情况都有。
    const guard = await guardAIRequest(request, 'session/start', !settings?.apiKey);
    if (guard.response) return guard.response;

    const { url: imageUrl, description, error: imageError } = generateProjectiveImage(
      Array.isArray(recentCards) ? recentCards : []
    );

    const firstQuestion = await generateFirstQuestion(aiConfig, description);

    return NextResponse.json({
      sessionId: uuidv4(),
      imageUrl,
      imageDescription: description,
      imageError: imageError ?? null,
      firstQuestion,
    });
  } catch (error) {
    logError('session/start', error);
    return NextResponse.json(
      { error: toClientMessage(error, '启动探索失败，请重试。') },
      { status: 500 }
    );
  }
}
