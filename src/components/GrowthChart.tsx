'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GrowthData, ThemeRecord } from '@/types';
import { getGrowthData } from '@/lib/storage';
import { ensureIdentity, fetchGrowth } from '@/lib/sync';

export default function GrowthChart() {
  const [data, setData] = useState<GrowthData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // 先用本地数据渲染，页面立刻有内容
      const local = getGrowthData();
      if (!cancelled) setData(local);

      // 再尝试远端。后端的统计跨设备且更权威（游客升级成账号后，
      // 本地那份统计只覆盖当前设备）。拿不到就保持本地视图。
      const identity = await ensureIdentity();
      if (!identity || cancelled) return;

      const remote = await fetchGrowth();
      if (!remote || cancelled) return;

      // 远端记录数不少于本地时才替换：避免刚登录、后端还没同步完
      // 就把本地已有的统计覆盖成 0。
      if (remote.sessions >= local.sessions) setData(remote);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;

  const topThemes = data.themeHistory.slice(0, 12);
  const maxCount = Math.max(...topThemes.map((t) => t.count), 1);

  return (
    <div
      style={{ backgroundColor: 'var(--bg)', color: 'var(--fg)' }}
      className="min-h-svh py-16 px-6"
    >
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="animate-fade-in opacity-0-init mb-12">
          <Link
            href="/"
            style={{ color: 'var(--fg-3)' }}
            className="text-xs mb-8 inline-block hover:opacity-70 transition-opacity"
          >
            ← 返回首页
          </Link>
          <h1
            style={{ color: 'var(--fg)' }}
            className="font-serif text-2xl mt-4"
          >
            心理成长轨迹
          </h1>
          <p style={{ color: 'var(--fg-3)' }} className="text-sm mt-2">
            {data.sessions > 0
              ? `共完成 ${data.sessions} 次探索`
              : '还没有探索记录'}
          </p>
        </div>

        {data.sessions === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mb-12 animate-fade-in delay-100 opacity-0-init">
              <StatCard label="探索次数" value={String(data.sessions)} />
              <StatCard
                label="主题种类"
                value={String(data.themeHistory.length)}
              />
            </div>

            {/* Theme bars */}
            {topThemes.length > 0 && (
              <div className="animate-fade-in delay-200 opacity-0-init">
                <h2
                  style={{ color: 'var(--fg-3)' }}
                  className="text-xs uppercase tracking-widest mb-6"
                >
                  出现最多的主题
                </h2>
                <div className="flex flex-col gap-4">
                  {topThemes.map((theme, i) => (
                    <ThemeBar
                      key={theme.theme}
                      record={theme}
                      maxCount={maxCount}
                      rank={i}
                    />
                  ))}
                </div>
              </div>
            )}

            <div
              style={{ borderColor: 'var(--border)' }}
              className="border-t mt-12 pt-8 animate-fade-in delay-300 opacity-0-init"
            >
              <p
                style={{ color: 'var(--fg-3)' }}
                className="text-xs leading-relaxed text-center"
              >
                这些主题是你近期内心关注的映射。
                <br />
                它们没有好坏，只是你当下的样子。
              </p>
            </div>
          </>
        )}

        <div className="mt-10 flex justify-center animate-fade-in delay-400 opacity-0-init">
          <Link
            href="/explore"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)' }}
            className="px-8 py-3.5 rounded-full text-sm font-medium transition-opacity hover:opacity-75"
          >
            开始新的探索
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border)',
      }}
      className="border rounded-2xl p-5"
    >
      <p style={{ color: 'var(--fg-3)' }} className="text-xs mb-1">
        {label}
      </p>
      <p style={{ color: 'var(--fg)' }} className="text-3xl font-light">
        {value}
      </p>
    </div>
  );
}

function ThemeBar({
  record,
  maxCount,
  rank,
}: {
  record: ThemeRecord;
  maxCount: number;
  rank: number;
}) {
  const pct = (record.count / maxCount) * 100;
  return (
    <div
      className="animate-fade-in opacity-0-init"
      style={{ animationDelay: `${300 + rank * 60}ms` }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span style={{ color: 'var(--fg)' }} className="text-sm">
          {record.theme}
        </span>
        <span style={{ color: 'var(--fg-3)' }} className="text-xs">
          {record.count} 次
        </span>
      </div>
      <div
        style={{ backgroundColor: 'var(--border)', height: '3px', borderRadius: '2px' }}
        className="w-full overflow-hidden"
      >
        <div
          style={{
            width: `${pct}%`,
            backgroundColor: 'var(--fg)',
            height: '100%',
            borderRadius: '2px',
            transition: 'width 0.8s ease',
          }}
        />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 animate-fade-in delay-100 opacity-0-init">
      <p style={{ color: 'var(--fg-2)' }} className="font-serif text-lg mb-2">
        还没有记录
      </p>
      <p style={{ color: 'var(--fg-3)' }} className="text-sm">
        完成第一次探索后，你的主题将会出现在这里。
      </p>
    </div>
  );
}
