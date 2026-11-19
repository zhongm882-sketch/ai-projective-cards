'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isConfigured } from '@/lib/storage';

export default function HomePage() {
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkConfig() {
      // 先检查服务端配置
      try {
        const res = await fetch('/api/config');
        const { hasServerConfig } = await res.json();
        if (hasServerConfig) {
          setConfigured(true);
          return;
        }
      } catch {
        // 忽略检测错误
      }
      // 检查本地配置
      setConfigured(isConfigured());
    }
    checkConfig();
  }, []);

  return (
    <main
      style={{ backgroundColor: 'var(--bg)' }}
      className="flex flex-1 flex-col items-center justify-center min-h-svh px-6"
    >
      <div className="flex flex-col items-center gap-12 text-center max-w-sm w-full">
        {/* Logo mark */}
        <div className="animate-fade-in opacity-0-init flex flex-col items-center gap-3">
          <div className="relative w-10 h-10">
            <div
              style={{ borderColor: 'var(--fg)' }}
              className="absolute inset-0 rounded-full border"
            />
            <div
              style={{ backgroundColor: 'var(--fg)' }}
              className="absolute inset-[6px] rounded-full opacity-20"
            />
          </div>
          <span
            style={{ color: 'var(--fg)', letterSpacing: '0.2em' }}
            className="text-xs font-medium uppercase tracking-widest"
          >
            AI 投射卡
          </span>
        </div>

        {/* Tagline */}
        <div className="animate-fade-in delay-200 opacity-0-init flex flex-col gap-2">
          <p style={{ color: 'var(--fg)' }} className="font-serif text-2xl leading-relaxed">
            每一次联想，
          </p>
          <p style={{ color: 'var(--fg)' }} className="font-serif text-2xl leading-relaxed">
            都是认识自己的开始。
          </p>
        </div>

        {/* CTA */}
        <div className="animate-fade-in delay-400 opacity-0-init w-full flex flex-col gap-4">
          <Link
            href="/explore"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)' }}
            className="w-full py-4 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-75 active:opacity-60"
          >
            开始探索
          </Link>

          {/* 承载信息的文字统一用 fg-2（对比度约 4.9:1，达到 WCAG AA）。
              原先用的 fg-3 只有约 2.1:1，强光下看不清。 */}
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/history"
              style={{ color: 'var(--fg-2)' }}
              className="text-xs py-2 transition-opacity hover:opacity-70"
            >
              探索历史
            </Link>
            <span style={{ color: 'var(--border)' }} aria-hidden="true">·</span>
            <Link
              href="/growth"
              style={{ color: 'var(--fg-2)' }}
              className="text-xs py-2 transition-opacity hover:opacity-70"
            >
              成长轨迹
            </Link>
            <span style={{ color: 'var(--border)' }} aria-hidden="true">·</span>
            <Link
              href="/account"
              style={{ color: 'var(--fg-2)' }}
              className="text-xs py-2 transition-opacity hover:opacity-70"
            >
              账号
            </Link>
          </div>
        </div>
      </div>

      <p
        style={{ color: 'var(--fg-2)' }}
        className="absolute bottom-8 text-xs animate-fade-in delay-600 opacity-0-init text-center px-6"
      >
        图片不是答案，AI不是权威，真正的价值来自你的联想。
      </p>
    </main>
  );
}
