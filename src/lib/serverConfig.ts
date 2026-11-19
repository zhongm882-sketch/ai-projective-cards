import { AIConfig, PROVIDERS } from '@/lib/aiProvider';
import { ProviderKey } from '@/types';

// 服务端环境变量配置
// 这些变量只在服务器端可用，不会暴露到浏览器

function isProviderKey(value: string): value is ProviderKey {
  return value in PROVIDERS;
}

export function getServerAIConfig(providedConfig?: AIConfig | null): AIConfig | null {
  // 如果前端提供了配置，优先使用前端配置
  if (providedConfig?.apiKey) {
    return providedConfig;
  }

  // 从环境变量读取配置
  const rawProvider = process.env.AI_PROVIDER?.trim() || 'deepseek';
  const apiKey = process.env.AI_API_KEY?.trim() || '';
  const model = process.env.AI_MODEL?.trim() || '';
  const baseUrl = process.env.AI_BASE_URL?.trim() || undefined;

  if (!apiKey) {
    return null;
  }

  // 环境变量里写错的 provider 名字要尽早暴露，而不是悄悄按错误的厂商去调用。
  if (!isProviderKey(rawProvider)) {
    throw new Error(
      `AI_PROVIDER 的值「${rawProvider}」无效，可选：${Object.keys(PROVIDERS).join(' / ')}`
    );
  }

  // 没指定 model 就用该厂商的默认值。
  // 默认值统一取自 PROVIDERS，避免这里和设置页各存一份、改一处漏一处。
  const finalModel = model || PROVIDERS[rawProvider].defaultModel;

  return {
    provider: rawProvider,
    apiKey,
    model: finalModel,
    baseUrl,
  };
}
