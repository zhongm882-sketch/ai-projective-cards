'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Report } from '@/types';
import { saveSessionNote } from '@/lib/storage';
import { uploadNote } from '@/lib/sync';

interface ReportViewProps {
  report: Report;
  sessionId: string;
  date: string;
  /** 之前已经留下的一句话（如果有） */
  initialNote?: string;
}

export default function ReportView({
  report,
  sessionId,
  date,
  initialNote = '',
}: ReportViewProps) {
  const [note, setNote] = useState(initialNote);
  // 已经留过话就直接展示，不再显示输入框
  const [noteSaved, setNoteSaved] = useState(Boolean(initialNote));

  // 原先这里只改了 React 状态，从没写回存储——刷新页面这句话就没了。
  const handleSaveNote = () => {
    const trimmed = note.trim();
    if (!trimmed) return;

    // 先存本地，再后台同步。本地是主存储，同步失败不影响这句话留下来。
    saveSessionNote(sessionId, trimmed);
    setNote(trimmed);
    setNoteSaved(true);
    void uploadNote(sessionId, trimmed);
  };

  const formattedDate = new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div
      style={{ backgroundColor: 'var(--bg)', color: 'var(--fg)' }}
      className="min-h-svh py-16 px-6"
    >
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="animate-fade-in opacity-0-init mb-14 flex flex-col gap-2">
          <p style={{ color: 'var(--fg-3)' }} className="text-xs uppercase tracking-widest">
            AI 心理投射探索报告
          </p>
          <p style={{ color: 'var(--fg-3)' }} className="text-xs">
            {formattedDate}
          </p>
        </div>

        {/* Themes */}
        <Section delay="delay-100" title="今日探索主题">
          <div className="flex flex-wrap gap-2 mt-4">
            {report.themes.map((theme, i) => (
              <span
                key={i}
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border)',
                  color: 'var(--fg)',
                }}
                className="border rounded-full px-4 py-1.5 text-sm font-medium"
              >
                {theme}
              </span>
            ))}
          </div>
        </Section>

        <Divider />

        {/* Core observations */}
        <Section delay="delay-200" title="核心观察">
          <Prose>{report.coreObservations}</Prose>
        </Section>

        <Divider />

        {/* Current psychological themes */}
        <Section delay="delay-300" title="当前心理主题">
          <div className="flex flex-col gap-4 mt-4">
            {[
              { label: '你似乎更关注', content: report.currentFocus },
              { label: '近期可能正在经历', content: report.possibleExperience },
              { label: '内在张力', content: report.innerConflicts },
              { label: '内在需求', content: report.needs },
              { label: '心理资源', content: report.resources },
            ].map(({ label, content }) =>
              content ? (
                <div key={label} className="flex flex-col gap-1">
                  <p style={{ color: 'var(--fg-3)' }} className="text-xs uppercase tracking-wide">
                    {label}
                  </p>
                  <Prose>{content}</Prose>
                </div>
              ) : null
            )}
          </div>
        </Section>

        <Divider />

        {/* Inner strengths */}
        <Section delay="delay-400" title="内在优势">
          <Prose>{report.innerStrengths}</Prose>
        </Section>

        <Divider />

        {/* Reflection question */}
        <Section delay="delay-500" title="值得继续思考的问题">
          <blockquote
            style={{ borderLeftColor: 'var(--fg)', color: 'var(--fg)' }}
            className="font-serif text-xl leading-relaxed border-l-2 pl-5 mt-4 italic"
          >
            {report.reflectionQuestion}
          </blockquote>
        </Section>

        <Divider />

        {/* Weekly practice */}
        <Section delay="delay-600" title="本周实践建议">
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border)',
            }}
            className="border rounded-2xl p-5 mt-4"
          >
            <p style={{ color: 'var(--fg)' }} className="text-base leading-relaxed">
              {report.weeklyPractice}
            </p>
          </div>
        </Section>

        <Divider />

        {/* Closing message */}
        <section className="animate-fade-in delay-600 opacity-0-init mb-10">
          <h2 style={{ color: 'var(--fg-2)' }} className="text-xs uppercase tracking-widest mb-4">
            还有什么想说的吗
          </h2>
          {noteSaved ? (
            <div className="flex flex-col gap-3">
              <p style={{ color: 'var(--fg)', lineHeight: '1.85' }} className="text-base whitespace-pre-wrap">
                {note}
              </p>
              <button
                onClick={() => setNoteSaved(false)}
                style={{ color: 'var(--fg-3)' }}
                className="text-xs text-left hover:opacity-70 transition-opacity"
              >
                修改
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="任何感受、想法，或者今天探索结束后，你想留下的一句话…"
                rows={4}
                style={{
                  backgroundColor: 'var(--bg-card)',
                  color: 'var(--fg)',
                  borderColor: 'var(--border)',
                  resize: 'none',
                }}
                className="w-full rounded-2xl border p-4 text-base leading-relaxed placeholder:opacity-40 outline-none"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleSaveNote}
                  disabled={!note.trim()}
                  style={{
                    backgroundColor: note.trim() ? 'var(--accent)' : 'var(--border)',
                    color: note.trim() ? 'var(--bg)' : 'var(--fg-3)',
                  }}
                  className="px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed"
                >
                  留下这句话
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Footer note */}
        <div className="mt-6 mb-10 animate-fade-in delay-600 opacity-0-init">
          <p style={{ color: 'var(--fg-3)' }} className="text-xs leading-relaxed text-center">
            这份报告不是诊断，也不是答案。
            <br />
            它只是你今天与自己的一次对话记录。
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 animate-fade-in delay-600 opacity-0-init">
          <Link
            href="/explore"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)' }}
            className="w-full py-4 rounded-full text-sm font-medium text-center transition-opacity hover:opacity-75"
          >
            再次探索
          </Link>
          <Link
            href="/growth"
            style={{ color: 'var(--fg-3)' }}
            className="w-full py-3 text-sm text-center transition-opacity hover:opacity-70"
          >
            查看成长轨迹
          </Link>
          <Link
            href="/"
            style={{ color: 'var(--fg-3)' }}
            className="w-full py-2 text-xs text-center transition-opacity hover:opacity-70"
          >
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  delay = '',
}: {
  title: string;
  children: React.ReactNode;
  delay?: string;
}) {
  return (
    <section className={`animate-fade-in opacity-0-init ${delay} mb-8`}>
      <h2
        style={{ color: 'var(--fg-2)' }}
        className="text-xs uppercase tracking-widest mb-1"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Divider() {
  return (
    <div
      style={{ borderColor: 'var(--border)' }}
      className="border-t my-8"
    />
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{ color: 'var(--fg)', lineHeight: '1.85' }}
      className="text-base mt-3"
    >
      {children}
    </p>
  );
}
