'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ExplorationSession } from '@/types';
import { getSessions } from '@/lib/storage';
import { ensureIdentity, fetchExplorations, syncPending, type RemoteSummary } from '@/lib/sync';

/**
 * 探索历史列表。
 *
 * getSessions() 一直在返回全部历史（最多 100 条），但界面上从来没有地方
 * 把它列出来——用户做了十次探索只能看到一个数字。这个页面把它补上。
 *
 * 数据来源策略：本地永远是基础（离线可用），拿到远端数据后合并——
 * 远端有而本地没有的（换设备的情况）也要显示出来。
 */

interface Row {
  /** 本地会话 id 或远端 clientId，用于跳转报告页 */
  id: string;
  cardPath: string | null;
  themes: string[];
  roundCount: number;
  createdAt: string;
  /** 仅存在于远端：本地没有内容，点进去需要现拉 */
  remoteOnly: boolean;
}

function toRow(session: ExplorationSession): Row {
  return {
    id: session.id,
    cardPath: session.imageUrl,
    themes: session.report?.themes ?? [],
    roundCount: session.rounds.length,
    createdAt: session.createdAt,
    remoteOnly: false,
  };
}

function remoteToRow(item: RemoteSummary): Row {
  return {
    // 优先用 clientId：它和本地 id 一致，跳转报告页时能命中本地缓存
    id: item.clientId ?? item.id,
    cardPath: item.cardPath,
    themes: item.themes,
    roundCount: item.roundCount,
    createdAt: item.createdAt,
    remoteOnly: true,
  };
}

export default function HistoryList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // 先渲染本地数据，让页面立刻有内容
      const local = getSessions().filter((s) => s.report);
      if (!cancelled) setRows(local.map(toRow));

      // 再尝试远端。拿不到就保持本地视图，不报错——离线也该能翻历史。
      const identity = await ensureIdentity();
      if (!identity || cancelled) return;

      // 顺手把本地没同步的补传上去
      const uploaded = await syncPending(local);
      if (uploaded > 0 && !cancelled) {
        setSyncNote(`已同步 ${uploaded} 次探索到账号。`);
      }

      const remote = await fetchExplorations(100);
      if (!remote || cancelled) return;

      // 合并：以本地 id 为键去重，本地优先（本地有完整内容）
      const localIds = new Set(local.map((s) => s.id));
      const merged = [
        ...local.map(toRow),
        ...remote.items.filter((i) => !localIds.has(i.clientId ?? i.id)).map(remoteToRow),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      setRows(merged);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ backgroundColor: 'var(--bg)', color: 'var(--fg)' }} className="min-h-svh py-16 px-6">
      <div className="max-w-xl mx-auto">
        <div className="animate-fade-in opacity-0-init mb-10">
          <Link
            href="/"
            style={{ color: 'var(--fg-2)' }}
            className="text-xs mb-6 inline-block hover:opacity-70 transition-opacity"
          >
            ← 返回首页
          </Link>
          <h1 className="font-serif text-2xl mt-4">探索历史</h1>
          {rows !== null && (
            <p style={{ color: 'var(--fg-2)' }} className="text-sm mt-2">
              {rows.length > 0 ? `共 ${rows.length} 次探索` : '还没有探索记录'}
            </p>
          )}
        </div>

        {rows === null ? (
          <p
            style={{ color: 'var(--fg-2)' }}
            className="text-sm"
            role="status"
            aria-live="polite"
          >
            正在加载…
          </p>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 animate-fade-in delay-100 opacity-0-init">
            <p style={{ color: 'var(--fg-2)' }} className="font-serif text-lg mb-2">
              还没有记录
            </p>
            <p style={{ color: 'var(--fg-2)' }} className="text-sm mb-8">
              完成第一次探索后，它会出现在这里。
            </p>
            <Link
              href="/explore"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)' }}
              className="px-8 py-3.5 rounded-full text-sm font-medium transition-opacity hover:opacity-75"
            >
              开始探索
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((row, i) => (
              <li
                key={`${row.id}-${row.createdAt}`}
                className="animate-fade-in opacity-0-init"
                style={{ animationDelay: `${Math.min(i * 50, 400)}ms` }}
              >
                <Link
                  href={`/report/${row.id}`}
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                  className="border rounded-2xl p-4 flex gap-4 items-center transition-opacity hover:opacity-80"
                >
                  {row.cardPath ? (
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0">
                      <Image
                        src={row.cardPath}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="56px"
                      />
                    </div>
                  ) : (
                    <div
                      style={{ backgroundColor: 'var(--border)' }}
                      className="w-14 h-14 rounded-xl shrink-0"
                      aria-hidden="true"
                    />
                  )}

                  <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap gap-1.5">
                      {row.themes.length > 0 ? (
                        row.themes.slice(0, 3).map((theme) => (
                          <span
                            key={theme}
                            style={{ borderColor: 'var(--border)', color: 'var(--fg)' }}
                            className="border rounded-full px-2.5 py-0.5 text-xs"
                          >
                            {theme}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: 'var(--fg-2)' }} className="text-xs">
                          未生成主题
                        </span>
                      )}
                    </div>
                    <p style={{ color: 'var(--fg-2)' }} className="text-xs">
                      <time dateTime={row.createdAt}>
                        {new Date(row.createdAt).toLocaleDateString('zh-CN', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </time>
                      {' · '}
                      {row.roundCount} 轮对话
                      {row.remoteOnly && ' · 来自其他设备'}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {syncNote && (
          <p
            style={{ color: 'var(--fg-2)' }}
            className="text-xs text-center mt-8"
            role="status"
            aria-live="polite"
          >
            {syncNote}
          </p>
        )}
      </div>
    </div>
  );
}
