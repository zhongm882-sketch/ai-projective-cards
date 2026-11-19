'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ExplorationSession } from '@/types';
import { getSession, saveSession } from '@/lib/storage';
import { fetchExplorations, fetchExploration } from '@/lib/sync';
import ReportView from '@/components/ReportView';
import Link from 'next/link';

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<ExplorationSession | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // 本地优先：命中就立刻渲染，不必等网络。
      const local = getSession(id);
      if (local) {
        setSession(local);
        return;
      }

      // 本地没有——可能是在别的设备上做的探索，去后端找。
      // 后端按自己的 uuid 主键存，而这里的 id 是本地会话 id（= clientId），
      // 所以先列表里按 clientId 找到对应的远端 id。
      const list = await fetchExplorations(100);
      if (cancelled) return;

      const match = list?.items.find((i) => i.clientId === id || i.id === id);
      if (!match) {
        setSession(null);
        return;
      }

      const remote = await fetchExploration(match.id);
      if (cancelled) return;

      if (remote) {
        // 缓存到本地，下次直接命中，也让离线时还能看
        saveSession(remote);
        setSession(remote);
      } else {
        setSession(null);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (session === undefined) {
    return (
      <div
        style={{ backgroundColor: 'var(--bg)' }}
        className="min-h-svh flex items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <span className="sr-only">正在加载报告…</span>
        <div
          style={{ backgroundColor: 'var(--border)' }}
          className="w-6 h-6 rounded-full animate-pulse-slow"
        />
      </div>
    );
  }

  if (!session || !session.report) {
    return (
      <div
        style={{ backgroundColor: 'var(--bg)', color: 'var(--fg-2)' }}
        className="min-h-svh flex flex-col items-center justify-center gap-4 px-6 text-center"
      >
        <p className="font-serif text-lg">报告未找到</p>
        <p style={{ color: 'var(--fg-2)' }} className="text-sm max-w-xs leading-relaxed">
          这份报告可能保存在另一台设备上。登录账号后可以同步查看。
        </p>
        <div className="flex flex-col items-center gap-2 mt-2">
          <Link
            href="/account"
            style={{ color: 'var(--fg)' }}
            className="text-sm underline hover:opacity-70 transition-opacity"
          >
            前往登录
          </Link>
          <Link
            href="/"
            style={{ color: 'var(--fg-2)' }}
            className="text-xs hover:opacity-70 transition-opacity"
          >
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ReportView
      report={session.report}
      sessionId={session.id}
      date={session.createdAt}
      initialNote={session.note}
    />
  );
}
