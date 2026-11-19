import { ProviderKey } from '@/types';

/**
 * AI 厂商的元数据（名称、模型列表、默认值等）。
 *
 * 这个文件必须保持「纯数据 + 纯类型」，不能导入任何 AI SDK——
 * 设置页是客户端组件，会 import 这里的 PROVIDERS。一旦这里牵连到
 * @anthropic-ai/sdk，SDK 里的 node:fs / node:path 就会被打进浏览器包，
 * webpack 构建会直接失败。实际调用 AI 的代码放在 aiProvider.ts（仅服务端）。
 */

export interface AIConfig {
  provider: ProviderKey;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export const PROVIDERS = {
  anthropic: {
    name: 'Anthropic Claude',
    description: '最强的多语言理解能力',
    keyLabel: 'API Key',
    keyHint: 'sk-ant-...',
    keyUrl: 'https://console.anthropic.com',
    models: [
      { id: 'claude-opus-5', name: 'Claude Opus 5（推荐）' },
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5（均衡）' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5（快速）' },
    ],
    defaultModel: 'claude-opus-5',
    baseUrl: undefined as string | undefined,
  },
  openai: {
    name: 'OpenAI',
    description: 'GPT 系列',
    keyLabel: 'API Key',
    keyHint: 'sk-...',
    keyUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o（推荐）' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini（快速）' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo（低成本）' },
    ],
    defaultModel: 'gpt-4o',
    baseUrl: undefined as string | undefined,
  },
  deepseek: {
    name: 'DeepSeek',
    description: '中文理解优秀，成本低',
    keyLabel: 'API Key',
    keyHint: 'sk-...',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat（推荐）' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner（深度推理）' },
    ],
    defaultModel: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com',
  },
  zhipu: {
    name: '智谱 GLM',
    description: '国产大模型',
    keyLabel: 'API Key',
    keyHint: '你的APIKey.Secret',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    models: [
      { id: 'glm-4-flash', name: 'GLM-4 Flash（免费推荐）' },
      { id: 'glm-4', name: 'GLM-4' },
      { id: 'glm-4-plus', name: 'GLM-4 Plus（最强）' },
      { id: 'glm-4-air', name: 'GLM-4 Air（经济）' },
    ],
    defaultModel: 'glm-4-flash',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4/',
  },
  custom: {
    name: '自定义',
    description: '任意 OpenAI 兼容接口',
    keyLabel: 'API Key',
    keyHint: '你的 API Key',
    keyUrl: '',
    models: [] as { id: string; name: string }[],
    defaultModel: '',
    baseUrl: '',
  },
} satisfies Record<ProviderKey, {
  name: string;
  description: string;
  keyLabel: string;
  keyHint: string;
  keyUrl: string;
  models: { id: string; name: string }[];
  defaultModel: string;
  baseUrl: string | undefined;
}>;

/**
 * Claude 4.6 及以后的模型支持自适应思考与 effort 参数。
 * 更早的模型（如 Haiku 4.5）不支持 effort，发送会直接报错，因此必须区分。
 */
export function supportsAdaptiveThinking(model: string): boolean {
  return /^claude-(opus-5|sonnet-5|fable-5|mythos-5|opus-4-[678]|sonnet-4-6)/.test(model);
}
