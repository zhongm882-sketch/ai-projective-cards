'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  type Identity,
  getIdentity,
  register,
  login,
  logout,
  syncPending,
} from '@/lib/sync';
import { getSessions } from '@/lib/storage';

/**
 * 账号面板。
 *
 * 默认游客可用、零摩擦——注册只是「想跨设备」时的可选升级。
 * 这也是为什么这里不做任何强制引导：用户来是为了探索自己，不是为了注册。
 */

type Mode = 'idle' | 'register' | 'login';

export default function AccountPanel() {
  const [identity, setIdentity] = useState<Identity | null | undefined>(undefined);
  const [mode, setMode] = useState<Mode>('idle');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // undefined 表示还在查，null 表示确认未登录——两者的界面不同，
    // 混用会让页面先闪一下「未登录」再跳到已登录。
    void getIdentity().then((id) => setIdentity(id));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    setNotice(null);

    // 注册和登录分开处理：两者的返回类型不同（注册多一个 migrated），
    // 合成一个联合类型再取字段会丢掉类型信息。
    if (mode === 'register') {
      const result = await register(email.trim(), password, phone.trim() || undefined);
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }

      setIdentity(result.identity);
      setPassword('');
      setPhone('');
      setMode('idle');

      // 后端会把游客期间的记录迁移过来，明确告诉用户结果——
      // 否则他会怀疑之前的探索丢了。
      setNotice(
        result.migrated > 0
          ? `已把 ${result.migrated} 次探索同步到账号。`
          : '账号已创建，之后的探索会自动同步。'
      );
      setBusy(false);
      return;
    }

    const result = await login(email.trim(), password);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }

    setIdentity(result.identity);
    setPassword('');
    setMode('idle');

    // 登录后把本地未同步的记录补传上去
    const uploaded = await syncPending(getSessions());
    setNotice(uploaded > 0 ? `已同步 ${uploaded} 次本地探索。` : '已登录。');
    setBusy(false);
  }

  async function handleLogout() {
    setBusy(true);
    await logout();
    setIdentity(null);
    setNotice('已退出登录。本地记录仍然保留。');
    setBusy(false);
  }

  return (
    <div style={{ backgroundColor: 'var(--bg)', color: 'var(--fg)' }} className="min-h-svh py-12 px-6">
      <div className="max-w-md mx-auto">
        <div className="animate-fade-in opacity-0-init mb-10">
          <Link
            href="/"
            style={{ color: 'var(--fg-2)' }}
            className="text-xs mb-6 inline-block hover:opacity-70 transition-opacity"
          >
            ← 返回首页
          </Link>
          <h1 className="font-serif text-2xl mt-4">账号与同步</h1>
          <p style={{ color: 'var(--fg-2)' }} className="text-sm mt-2 leading-relaxed">
            不注册也能完整使用。注册后，你的探索记录会加密保存在服务器，
            换设备也能看到。
          </p>
        </div>

        {identity === undefined ? (
          <p style={{ color: 'var(--fg-2)' }} className="text-sm" role="status" aria-live="polite">
            正在检查登录状态…
          </p>
        ) : identity?.type === 'user' ? (
          <section className="animate-fade-in delay-100 opacity-0-init">
            <div
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              className="border rounded-2xl p-5 mb-6"
            >
              <p style={{ color: 'var(--fg-2)' }} className="text-xs mb-1">
                已登录
              </p>
              <p className="text-base">{identity.email}</p>
            </div>
            <button
              onClick={handleLogout}
              disabled={busy}
              style={{ borderColor: 'var(--border)', color: 'var(--fg)' }}
              className="w-full border rounded-full py-3.5 text-sm transition-opacity hover:opacity-70 disabled:opacity-40"
            >
              退出登录
            </button>
          </section>
        ) : (
          <section className="animate-fade-in delay-100 opacity-0-init">
            {mode === 'idle' ? (
              <div className="flex flex-col gap-3">
                <div
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                  className="border rounded-2xl p-5 mb-2"
                >
                  <p style={{ color: 'var(--fg-2)' }} className="text-xs mb-1">
                    当前状态
                  </p>
                  <p className="text-base">游客模式</p>
                  <p style={{ color: 'var(--fg-2)' }} className="text-xs mt-2 leading-relaxed">
                    记录保存在这台设备上。清空浏览器数据或更换设备会丢失。
                  </p>
                </div>
                <button
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)' }}
                  className="w-full py-4 rounded-full text-sm font-medium transition-opacity hover:opacity-75"
                >
                  创建账号并同步
                </button>
                <button
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  style={{ color: 'var(--fg-2)' }}
                  className="w-full py-3 text-sm transition-opacity hover:opacity-70"
                >
                  我已有账号，登录
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label
                    htmlFor="account-email"
                    style={{ color: 'var(--fg-2)' }}
                    className="text-xs uppercase tracking-widest"
                  >
                    邮箱
                  </label>
                  <input
                    id="account-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border)',
                      color: 'var(--fg)',
                    }}
                    className="w-full border rounded-xl px-4 py-3 text-sm mt-2"
                  />
                </div>
                {mode === 'register' && (
                  <div>
                    <label
                      htmlFor="account-phone"
                      style={{ color: 'var(--fg-2)' }}
                      className="text-xs uppercase tracking-widest"
                    >
                      手机号（可选）
                    </label>
                    <input
                      id="account-phone"
                      type="tel"
                      autoComplete="tel"
                      placeholder="13800138000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      style={{
                        backgroundColor: 'var(--bg-card)',
                        borderColor: 'var(--border)',
                        color: 'var(--fg)',
                      }}
                      className="w-full border rounded-xl px-4 py-3 text-sm mt-2"
                    />
                    <p style={{ color: 'var(--fg-2)' }} className="text-xs mt-2">
                      用于找回密码和重要通知（可不填）
                    </p>
                  </div>
                )}
                <div>
                  <label
                    htmlFor="account-password"
                    style={{ color: 'var(--fg-2)' }}
                    className="text-xs uppercase tracking-widest"
                  >
                    密码
                  </label>
                  <input
                    id="account-password"
                    type="password"
                    // 注册用 new-password 让密码管理器提示生成强密码
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border)',
                      color: 'var(--fg)',
                    }}
                    className="w-full border rounded-xl px-4 py-3 text-sm mt-2"
                  />
                  {mode === 'register' && (
                    <p style={{ color: 'var(--fg-2)' }} className="text-xs mt-2">
                      至少 8 位。建议用密码管理器生成。
                    </p>
                  )}
                </div>

                {error && (
                  <p
                    style={{ color: '#8B4040' }}
                    className="text-sm"
                    role="alert"
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)' }}
                  className="w-full py-4 rounded-full text-sm font-medium transition-opacity hover:opacity-75 disabled:opacity-40"
                >
                  {busy ? '处理中…' : mode === 'register' ? '创建账号' : '登录'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('idle');
                    setError(null);
                  }}
                  style={{ color: 'var(--fg-2)' }}
                  className="w-full py-2 text-xs transition-opacity hover:opacity-70"
                >
                  返回
                </button>
              </form>
            )}
          </section>
        )}

        {notice && (
          <p
            style={{ color: 'var(--fg-2)' }}
            className="text-sm text-center mt-6"
            role="status"
            aria-live="polite"
          >
            {notice}
          </p>
        )}

        <p style={{ color: 'var(--fg-2)' }} className="text-xs leading-relaxed mt-10 text-center">
          你的对话内容和报告在服务器上是加密存储的。
        </p>
      </div>
    </div>
  );
}
