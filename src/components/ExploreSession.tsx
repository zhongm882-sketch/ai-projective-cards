'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Round, ExplorationSession, Report, AppSettings } from '@/types';
// 从 providers 导入而非 aiProvider：后者会加载 AI SDK（依赖 node:fs），
// 客户端组件引用会导致构建失败。
import type { AIConfig } from '@/lib/providers';
import {
  saveSession,
  updateThemesFromSession,
  getSettings,
  getRecentCardPaths,
} from '@/lib/storage';
import { ensureIdentity, uploadExploration } from '@/lib/sync';
import { callAI } from '@/lib/aiClient';

type Phase =
  | { type: 'checking' }
  | { type: 'unconfigured' }
  | { type: 'loading' }
  | { type: 'exploring'; question: string; roundIndex: number }
  | { type: 'answering' }
  | { type: 'completing' }
  | { type: 'done'; reportId: string };

interface SessionData {
  id: string;
  imageUrl: string | null;
  imageDescription: string;
  rounds: Round[];
}

/**
 * 把本地 AI 配置整理成请求体里的 settings 字段。
 *
 * 服务端已配置 key 时前端不该传 settings（传了会覆盖服务端配置），
 * 所以没有 apiKey 就返回空对象。三个接口都用同一份逻辑，避免各写一遍走偏。
 */
function withSettings(cfg?: AppSettings | null): { settings?: AIConfig } {
  if (!cfg?.apiKey) return {};
  return {
    settings: {
      provider: cfg.provider,
      apiKey: cfg.apiKey,
      model: cfg.model,
      baseUrl: cfg.baseUrl,
    },
  };
}

export default function ExploreSession() {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const baseAnswerRef = useRef('');
  const shouldListenRef = useRef(false);

  const [phase, setPhase] = useState<Phase>({ type: 'checking' });
  const [session, setSession] = useState<SessionData | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [answer, setAnswer] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [questionVisible, setQuestionVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const startSession = useCallback(async (cfg?: AppSettings | null) => {
    setPhase({ type: 'loading' });
    setError(null);
    try {
      // 带上最近抽过的卡片，让服务端避开它们——纯随机会让人频繁遇到重复的图。
      const body = {
        ...withSettings(cfg),
        recentCards: getRecentCardPaths(),
      };
      const data = await callAI<{
        sessionId: string;
        imageUrl: string;
        imageDescription: string;
        imageError?: string;
        firstQuestion: string;
      }>('/api/session/start', body);

      const newSession: SessionData = {
        id: data.sessionId,
        imageUrl: data.imageUrl,
        imageDescription: data.imageDescription,
        rounds: [],
      };
      setSession(newSession);
      if (data.imageError) setImageError(data.imageError);

      setTimeout(() => {
        setPhase({ type: 'exploring', question: data.firstQuestion, roundIndex: 0 });
        setTimeout(() => setQuestionVisible(true), 50);
      }, 200);
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动失败，请刷新重试。');
      setPhase({ type: 'exploring', question: '', roundIndex: 0 });
    }
  }, []);

  useEffect(() => {
    async function checkAndStart() {
      // 先检查服务端配置
      let syncEnabled = false;
      try {
        const res = await fetch('/api/config');
        const config = (await res.json()) as {
          hasServerConfig?: boolean;
          syncEnabled?: boolean;
        };
        syncEnabled = config.syncEnabled === true;

        // 接了后端就先拿一个身份（游客即可），这样探索结束时能直接上传。
        // 不等它完成——拿不到身份也只是不同步，不该拖慢开场。
        if (syncEnabled) void ensureIdentity();

        if (config.hasServerConfig) {
          // 服务端已配置，直接开始（不传递 settings）
          setSettings(null);
          startSession(null);
          return;
        }
      } catch {
        // 忽略检测错误，继续检查本地配置
      }

      // 服务端未配置，检查本地配置
      const cfg = getSettings();
      if (!cfg || !cfg.apiKey.trim()) {
        setPhase({ type: 'unconfigured' });
        return;
      }
      setSettings(cfg);
      startSession(cfg);
    }
    checkAndStart();
  }, [startSession]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [answer]);

  useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, []);

  const handleSubmit = async () => {
    if (isListening) { shouldListenRef.current = false; recognitionRef.current?.stop(); setIsListening(false); }
    if (!session || !answer.trim() || phase.type !== 'exploring') return;

    const currentPhase = phase;
    const currentAnswer = answer.trim();
    setAnswer('');
    setPhase({ type: 'answering' });
    setQuestionVisible(false);

    const newRound: Round = { question: currentPhase.question, answer: currentAnswer };
    const updatedRounds = [...session.rounds, newRound];
    const updatedSession = { ...session, rounds: updatedRounds };
    setSession(updatedSession);

    try {
      const body = {
        ...withSettings(settings),
        imageDescription: session.imageDescription,
        rounds: updatedRounds,
        roundIndex: currentPhase.roundIndex + 1,
      };
      const data = await callAI<{ isComplete: boolean; question: string }>(
        '/api/session/respond',
        body
      );

      if (data.isComplete) {
        setPhase({ type: 'completing' });
        await completeSession(updatedSession);
      } else {
        setPhase({
          type: 'exploring',
          question: data.question,
          roundIndex: currentPhase.roundIndex + 1,
        });
        setTimeout(() => setQuestionVisible(true), 50);
        textareaRef.current?.focus();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误，请重试。');
      setPhase({
        type: 'exploring',
        question: currentPhase.question,
        roundIndex: currentPhase.roundIndex,
      });
      setAnswer(currentAnswer);
      setTimeout(() => setQuestionVisible(true), 50);
    }
  };

  const completeSession = async (finalSession: SessionData) => {
    try {
      const body = {
        ...withSettings(settings),
        imageDescription: finalSession.imageDescription,
        rounds: finalSession.rounds,
      };
      const data = await callAI<{ report: Report }>('/api/session/complete', body);

      const fullSession: ExplorationSession = {
        ...finalSession,
        createdAt: new Date().toISOString(),
        report: data.report,
      };

      // 先写本地：本地是主存储，后端同步是附加能力。
      // 顺序反过来的话，后端挂掉就会连本地记录一起丢。
      saveSession(fullSession);
      updateThemesFromSession(data.report.themes);

      setPhase({ type: 'done', reportId: fullSession.id });

      // 后台同步，不阻塞跳转。失败也不提示——用户此刻关心的是报告，
      // 而记录已经安全存在本地了。
      void uploadExploration(fullSession);

      setTimeout(() => router.push(`/report/${fullSession.id}`), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : '报告生成失败，请重试。');
      setPhase({ type: 'completing' });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const startRecognition = useCallback((currentAnswer: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    baseAnswerRef.current = currentAnswer;
    const recognition = new SR() as SpeechRecognition;
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = '';
      let interimText = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
        else interimText += event.results[i][0].transcript;
      }
      setAnswer((baseAnswerRef.current + finalText + interimText).trim());
    };
    recognition.onend = () => {
      // 浏览器静默自动停后，如果用户没有主动关闭则自动重启
      if (shouldListenRef.current) {
        startRecognition(baseAnswerRef.current);
      } else {
        setIsListening(false);
      }
    };
    recognition.onerror = () => {
      shouldListenRef.current = false;
      setIsListening(false);
    };
    recognition.start();
    recognitionRef.current = recognition;
  }, []);

  const toggleVoice = useCallback(() => {
    if (isListening) {
      shouldListenRef.current = false;
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    shouldListenRef.current = true;
    setIsListening(true);
    startRecognition(answer);
  }, [isListening, answer, startRecognition]);

  const roundIndex =
    phase.type === 'exploring' ? phase.roundIndex : session?.rounds.length ?? 0;
  const totalDots = 6;

  // Unconfigured state
  if (phase.type === 'unconfigured') {
    return (
      <div
        style={{ backgroundColor: 'var(--bg)' }}
        className="flex flex-col items-center justify-center min-h-svh px-6 gap-6"
      >
        <div className="text-center max-w-xs animate-fade-in opacity-0-init">
          <div
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}
            className="w-12 h-12 rounded-full border flex items-center justify-center mx-auto mb-6"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 6v4M10 14h.01" stroke="var(--fg-2)" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="10" cy="10" r="8" stroke="var(--fg-2)" strokeWidth="1.5"/>
            </svg>
          </div>
          <p style={{ color: 'var(--fg)' }} className="font-serif text-xl mb-2">
            请先配置 AI 模型
          </p>
          <p style={{ color: 'var(--fg-3)' }} className="text-sm leading-relaxed">
            填入你的 API Key，
            <br />
            就可以开始探索了。
          </p>
        </div>
        <Link
          href="/settings"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)' }}
          className="px-8 py-4 rounded-full text-sm font-medium transition-opacity hover:opacity-75 animate-fade-in delay-200 opacity-0-init"
        >
          配置 API Key
        </Link>
        <Link
          href="/"
          style={{ color: 'var(--fg-3)' }}
          className="text-xs hover:opacity-70 transition-opacity"
        >
          返回首页
        </Link>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: 'var(--bg)' }} className="flex flex-col min-h-svh">
      {/* Image area */}
      <div className="relative w-full" style={{ height: '42svh' }}>
        {phase.type === 'checking' || phase.type === 'loading' ? (
          <div className="skeleton w-full h-full" />
        ) : session?.imageUrl ? (
          <Image
            src={session.imageUrl}
            alt="投射图片"
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
        ) : (
          <ScenePlaceholder description={session?.imageDescription ?? ''} />
        )}
        {/* Image error notice */}
        {imageError && !session?.imageUrl && (
          <div
            className="absolute top-3 left-3 right-3 flex items-start gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ backgroundColor: 'rgba(139,64,64,0.1)', color: '#8B4040', backdropFilter: 'blur(4px)' }}
          >
            <span>图片未能生成：{imageError}</span>
          </div>
        )}
        {!imageError && !session?.imageUrl && session && (
          <div
            className="absolute top-3 right-3 text-xs px-2 py-1 rounded"
            style={{ color: 'var(--fg-3)', backgroundColor: 'rgba(247,245,240,0.8)' }}
          >
            文字模式 · <Link href="/settings" className="underline">配置图片生成</Link>
          </div>
        )}
        <div
          className="absolute inset-x-0 bottom-0 h-24 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, transparent, var(--bg))' }}
        />
      </div>

      {/* Content area */}
      <div className="flex flex-col flex-1 items-center px-6 pt-8 pb-10 max-w-lg mx-auto w-full">
        {(phase.type === 'checking' || phase.type === 'loading') && (
          <LoadingDots label="正在准备你的探索…" />
        )}

        {(phase.type === 'exploring' || phase.type === 'answering') && (
          <>
            <div
              className="w-full mb-8 transition-all duration-500"
              style={{
                opacity: questionVisible ? 1 : 0,
                transform: questionVisible ? 'translateY(0)' : 'translateY(10px)',
              }}
            >
              <p
                style={{ color: 'var(--fg)' }}
                className="font-serif text-xl leading-relaxed text-center"
              >
                {phase.type === 'exploring' ? phase.question : ''}
              </p>
            </div>

            <div className="w-full flex flex-col gap-3">
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isListening ? '正在聆听，请说话…' : '说说你的感受…'}
                  rows={3}
                  disabled={phase.type === 'answering'}
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--fg)',
                    borderColor: isListening ? 'var(--accent)' : 'var(--border)',
                    resize: 'none',
                    minHeight: '80px',
                    transition: 'border-color 0.2s',
                  }}
                  className="w-full rounded-2xl border p-4 text-base leading-relaxed placeholder:opacity-40"
                />
                {isListening && (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 pointer-events-none">
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--accent)' }} />
                    <span className="text-xs" style={{ color: 'var(--accent)' }}>聆听中</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleVoice}
                    disabled={phase.type === 'answering'}
                    title={isListening ? '停止录音' : '语音输入'}
                    style={{
                      backgroundColor: isListening ? 'var(--accent)' : 'var(--bg-card)',
                      color: isListening ? 'var(--bg)' : 'var(--fg-3)',
                      borderColor: isListening ? 'var(--accent)' : 'var(--border)',
                    }}
                    className="w-9 h-9 rounded-full border flex items-center justify-center transition-all duration-200 disabled:opacity-40"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <rect x="4" y="0.5" width="6" height="7.5" rx="3" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M1.5 7.5A5.5 5.5 0 0 0 7 13a5.5 5.5 0 0 0 5.5-5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      <line x1="7" y1="13" x2="7" y2="14.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  </button>
                  <p style={{ color: 'var(--fg-3)' }} className="text-xs">
                    {isListening ? '点击停止' : '⌘ + Enter 提交'}
                  </p>
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={!answer.trim() || phase.type === 'answering'}
                  style={{
                    backgroundColor: answer.trim() ? 'var(--accent)' : 'var(--border)',
                    color: answer.trim() ? 'var(--bg)' : 'var(--fg-3)',
                  }}
                  className="px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed"
                >
                  继续
                </button>
              </div>
            </div>

            <div className="flex gap-2 mt-10">
              {Array.from({ length: totalDots }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    backgroundColor:
                      i < roundIndex
                        ? 'var(--fg-2)'
                        : i === roundIndex
                        ? 'var(--fg)'
                        : 'var(--border)',
                    width: i === roundIndex ? '20px' : '6px',
                  }}
                  className="h-1.5 rounded-full transition-all duration-400"
                />
              ))}
            </div>
          </>
        )}

        {phase.type === 'completing' && (
          <div className="flex flex-col items-center gap-4 mt-12 animate-fade-in">
            <LoadingDots label="正在生成你的探索报告…" />
            <p style={{ color: 'var(--fg-3)' }} className="text-sm text-center mt-2">
              感谢你愿意如此真诚地探索自己。
            </p>
          </div>
        )}

        {phase.type === 'done' && (
          <div className="flex flex-col items-center gap-3 mt-12 animate-fade-in">
            <div
              style={{ backgroundColor: 'var(--fg)' }}
              className="w-6 h-6 rounded-full flex items-center justify-center"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="var(--bg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p style={{ color: 'var(--fg-2)' }} className="text-sm">
              报告已生成，正在跳转…
            </p>
          </div>
        )}

        {error && (
          <div
            style={{ color: '#8B4040', backgroundColor: '#FDF0F0', borderColor: '#F0D0D0' }}
            className="w-full mt-4 p-4 rounded-xl border text-sm text-center"
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingDots({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 mt-8">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{ backgroundColor: 'var(--fg-3)', animationDelay: `${i * 300}ms` }}
            className="w-1.5 h-1.5 rounded-full animate-pulse-slow"
          />
        ))}
      </div>
      <p style={{ color: 'var(--fg-3)' }} className="text-sm">
        {label}
      </p>
    </div>
  );
}

function ScenePlaceholder({ description }: { description: string }) {
  return (
    <div
      className="w-full h-full flex items-center justify-center px-8"
      style={{ background: 'linear-gradient(135deg, #EDE9E1 0%, #E5E0D5 50%, #DDD8CC 100%)' }}
    >
      {description && (
        <p
          style={{ color: 'var(--fg-2)' }}
          className="font-serif text-lg leading-relaxed text-center max-w-sm animate-fade-in"
        >
          {description}
        </p>
      )}
    </div>
  );
}
