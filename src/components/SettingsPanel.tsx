'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppSettings, ProviderKey } from '@/types';
// 从 providers 导入而非 aiProvider：后者会加载 AI SDK（依赖 node:fs），
// 客户端组件引用会导致构建失败。
import { PROVIDERS } from '@/lib/providers';
import { getSettings, saveSettings } from '@/lib/storage';

const PROVIDER_ORDER: ProviderKey[] = ['anthropic', 'openai', 'deepseek', 'zhipu', 'custom'];

const DEFAULT_SETTINGS: AppSettings = {
  provider: 'deepseek',
  apiKey: '',
  model: PROVIDERS.deepseek.defaultModel,
  baseUrl: '',
};

export default function SettingsPanel() {
  const router = useRouter();
  const [form, setForm] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [customModel, setCustomModel] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [testError, setTestError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const existing = getSettings();
    if (existing) {
      setForm(existing);
      if (existing.provider === 'custom') setCustomModel(existing.model);
    }
  }, []);

  function selectProvider(p: ProviderKey) {
    const defaultModel =
      p !== 'custom' ? PROVIDERS[p].defaultModel : customModel;
    setForm((f) => ({
      ...f,
      provider: p,
      model: defaultModel,
      baseUrl: PROVIDERS[p].baseUrl ?? '',
      // 切换服务商时清空 Key：各家的 Key 互不通用，沿用旧的等于把
      // A 家的凭据发给 B 家（切到「自定义」时尤其危险）。
      apiKey: p === f.provider ? f.apiKey : '',
    }));
    setTestStatus('idle');
  }

  function handleModelChange(model: string) {
    setForm((f) => ({ ...f, model }));
  }

  function handleCustomModelChange(val: string) {
    setCustomModel(val);
    setForm((f) => ({ ...f, model: val }));
  }

  async function handleTest() {
    if (!form.apiKey.trim()) {
      setTestStatus('fail');
      setTestError('请先输入 API Key');
      return;
    }
    setTestStatus('testing');
    setTestError('');
    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: toAIConfig() }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestStatus('ok');
      } else {
        setTestStatus('fail');
        setTestError(data.error || '连接失败');
      }
    } catch {
      setTestStatus('fail');
      setTestError('网络错误，请检查网络连接');
    }
  }

  function handleSave() {
    saveSettings(form);
    setSaved(true);
    setTimeout(() => {
      router.push('/');
    }, 800);
  }

  function toAIConfig() {
    return {
      provider: form.provider,
      apiKey: form.apiKey,
      model: form.model,
      baseUrl: form.baseUrl,
    };
  }

  const providerInfo = PROVIDERS[form.provider];
  const models = form.provider !== 'custom' ? PROVIDERS[form.provider].models : [];

  return (
    <div style={{ backgroundColor: 'var(--bg)', color: 'var(--fg)' }} className="min-h-svh py-12 px-6">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="animate-fade-in opacity-0-init mb-10">
          <button
            onClick={() => router.back()}
            style={{ color: 'var(--fg-3)' }}
            className="text-xs mb-6 inline-block hover:opacity-70 transition-opacity"
          >
            ← 返回
          </button>
          <h1 style={{ color: 'var(--fg)' }} className="font-serif text-2xl">
            配置 AI 模型
          </h1>
          <p style={{ color: 'var(--fg-3)' }} className="text-sm mt-2">
            选择你的 AI 提供商并填入 API Key，即可开始探索。
          </p>
        </div>

        {/* Provider selector */}
        <section className="animate-fade-in delay-100 opacity-0-init mb-8">
          <Label>AI 提供商</Label>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {PROVIDER_ORDER.map((key) => (
              <button
                key={key}
                onClick={() => selectProvider(key)}
                style={{
                  borderColor: form.provider === key ? 'var(--fg)' : 'var(--border)',
                  backgroundColor: form.provider === key ? 'var(--fg)' : 'var(--bg-card)',
                  color: form.provider === key ? 'var(--bg)' : 'var(--fg)',
                }}
                className="rounded-xl border px-4 py-3 text-left transition-all duration-150"
              >
                <div className="text-sm font-medium">{PROVIDERS[key].name}</div>
                <div
                  style={{ color: form.provider === key ? 'rgba(255,255,255,0.6)' : 'var(--fg-3)' }}
                  className="text-xs mt-0.5"
                >
                  {PROVIDERS[key].description}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* API Key */}
        <section className="animate-fade-in delay-200 opacity-0-init mb-6">
          <div className="flex items-center justify-between mb-3">
            <Label>{providerInfo.keyLabel}</Label>
            {providerInfo.keyUrl && (
              <a
                href={providerInfo.keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--fg-3)' }}
                className="text-xs hover:opacity-70 transition-opacity underline"
              >
                获取 Key →
              </a>
            )}
          </div>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={form.apiKey}
              onChange={(e) => {
                setForm((f) => ({ ...f, apiKey: e.target.value }));
                setTestStatus('idle');
              }}
              placeholder={providerInfo.keyHint}
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
                color: 'var(--fg)',
              }}
              className="w-full border rounded-xl px-4 py-3 text-sm pr-12 font-mono placeholder:font-sans placeholder:opacity-40"
            />
            <button
              onClick={() => setShowKey((v) => !v)}
              style={{ color: 'var(--fg-3)' }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs px-1 hover:opacity-70"
              type="button"
            >
              {showKey ? '隐藏' : '显示'}
            </button>
          </div>
        </section>

        {/* Model selector */}
        <section className="animate-fade-in delay-200 opacity-0-init mb-6">
          <Label>模型</Label>
          {form.provider === 'custom' ? (
            <input
              type="text"
              value={customModel}
              onChange={(e) => handleCustomModelChange(e.target.value)}
              placeholder="例如：qwen-max"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
                color: 'var(--fg)',
              }}
              className="w-full mt-3 border rounded-xl px-4 py-3 text-sm font-mono placeholder:font-sans placeholder:opacity-40"
            />
          ) : (
            <select
              value={form.model}
              onChange={(e) => handleModelChange(e.target.value)}
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
                color: 'var(--fg)',
              }}
              className="w-full mt-3 border rounded-xl px-4 py-3 text-sm appearance-none"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </section>

        {/* Custom base URL */}
        {form.provider === 'custom' && (
          <section className="animate-fade-in opacity-0-init mb-6">
            <Label>API 地址（Base URL）</Label>
            <input
              type="text"
              value={form.baseUrl ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
              placeholder="https://api.example.com/v1"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
                color: 'var(--fg)',
              }}
              className="w-full mt-3 border rounded-xl px-4 py-3 text-sm font-mono placeholder:font-sans placeholder:opacity-40"
            />
            <p style={{ color: 'var(--fg-3)' }} className="text-xs mt-2">
              必须兼容 OpenAI Chat Completions API 格式
            </p>
          </section>
        )}

        {/* Test connection */}
        <div className="animate-fade-in delay-300 opacity-0-init mb-8">
          <button
            onClick={handleTest}
            disabled={testStatus === 'testing' || !form.apiKey.trim()}
            style={{
              borderColor: 'var(--border)',
              color: testStatus === 'ok' ? '#4A7C59' : testStatus === 'fail' ? '#8B4040' : 'var(--fg-2)',
              backgroundColor: 'var(--bg-card)',
            }}
            className="w-full border rounded-xl py-3 text-sm transition-colors disabled:opacity-40"
          >
            {testStatus === 'testing'
              ? '连接中…'
              : testStatus === 'ok'
              ? '✓ 连接成功'
              : testStatus === 'fail'
              ? '✕ 连接失败'
              : '测试连接'}
          </button>
          {testStatus === 'fail' && testError && (
            <p style={{ color: '#8B4040' }} className="text-xs mt-2 text-center">
              {testError}
            </p>
          )}
        </div>

        {/* Save */}
        <div className="animate-fade-in delay-400 opacity-0-init">
          <button
            onClick={handleSave}
            disabled={!form.apiKey.trim() || saved}
            style={{
              backgroundColor: form.apiKey.trim() ? 'var(--accent)' : 'var(--border)',
              color: form.apiKey.trim() ? 'var(--bg)' : 'var(--fg-3)',
            }}
            className="w-full py-4 rounded-full text-sm font-medium transition-all disabled:cursor-not-allowed"
          >
            {saved ? '已保存 ✓' : '保存配置'}
          </button>
          <p style={{ color: 'var(--fg-3)' }} className="text-xs text-center mt-3">
            配置保存在你的浏览器本地；使用时会经由本站服务器转发到你选择的服务商，服务端不会存储它。
          </p>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ color: 'var(--fg-3)' }} className="text-xs uppercase tracking-widest">
      {children}
    </p>
  );
}
