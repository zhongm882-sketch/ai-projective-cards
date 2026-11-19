import { PROVIDERS, supportsAdaptiveThinking, type AIConfig } from './providers';

/**
 * 实际调用 AI 的实现。
 *
 * ⚠️ 仅限服务端使用。这里会加载 @anthropic-ai/sdk / openai，两者都依赖
 * node:fs、node:path 等 Node 内置模块，被客户端组件引用会导致 webpack 构建失败。
 * 客户端只需要厂商元数据时，请从 './providers' 导入，不要从这里导入。
 */

// 元数据从 providers.ts 转发出来，保持既有 import 路径可用。
export { PROVIDERS, supportsAdaptiveThinking };
export type { AIConfig };

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// 模块缓存 - 避免每次调用都重新导入
let anthropicModule: typeof import('@anthropic-ai/sdk') | null = null;
let openaiModule: typeof import('openai') | null = null;

export async function callAI(
  config: AIConfig,
  system: string,
  messages: Message[],
  maxTokens = 1000
): Promise<string> {
  if (config.provider === 'anthropic') {
    // 使用缓存的模块，避免重复导入
    anthropicModule = anthropicModule || await import('@anthropic-ai/sdk');
    const client = new anthropicModule.Anthropic({ apiKey: config.apiKey });

    // Opus 5 等新模型默认开启思考，而 max_tokens 是「思考 + 可见回答」的总上限。
    // effort 设为 low 把思考控制在浅层，避免思考吃光预算、可见回答被截断或为空。
    const thinkingParams = supportsAdaptiveThinking(config.model)
      ? { thinking: { type: 'adaptive' as const }, output_config: { effort: 'low' as const } }
      : {};

    const response = await client.messages.create({
      model: config.model,
      max_tokens: maxTokens,
      system,
      messages,
      ...thinkingParams,
    });

    // 安全分类器可能拒绝请求：这时是正常的 200，但 content 为空或只有部分内容。
    // 必须在读取 content 之前判断，否则下面会取到空值。
    if (response.stop_reason === 'refusal') {
      throw new Error('AI 出于安全策略拒绝了本次请求。可以换一种表达方式再试。');
    }

    // 思考块的文本默认为空，所以要找的是 text 块而不是第一个块。
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      // 只记录块类型，不记录内容——对话内容属于用户隐私，不进日志。
      throw new Error(
        `AI 未返回文本内容，收到的块类型：${response.content.map((b) => b.type).join(', ') || '无'}`
      );
    }
    return textBlock.text.trim();
  }

  // OpenAI / DeepSeek / Zhipu / Custom — all use the OpenAI SDK
  // 使用缓存的模块，避免重复导入
  openaiModule = openaiModule || await import('openai');
  const providerBaseUrl = PROVIDERS[config.provider]?.baseUrl;
  const baseURL = providerBaseUrl || config.baseUrl || undefined;

  const client = new openaiModule.default.OpenAI({ apiKey: config.apiKey, baseURL });
  const response = await client.chat.completions.create({
    model: config.model,
    max_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, ...messages],
  });

  return (response.choices[0]?.message?.content ?? '').trim();
}
