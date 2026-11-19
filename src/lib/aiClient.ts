'use client';

import { ensureIdentity } from '@/lib/sync';
import { ensureAccess } from '@/lib/accessGate';

/**
 * 调用 AI 接口的统一入口。
 *
 * 为什么需要它：接了后端之后，/api/session/* 会要求有效身份。访问 token
 * 只活 15 分钟，而一次探索可能持续更久——用户答到第四轮时 token 正好过期，
 * 直接把「身份已失效」怼给他是很糟的体验，他什么都没做错。
 *
 * 所以收到带 IDENTITY_REQUIRED 的 401 时，这里自动换一个身份再重试一次。
 * 只重试一次：如果换完身份还是 401，那是配置问题，重试一百次也一样。
 *
 * 同理，收到带 ACCESS_REQUIRED 的 403 时（服务端启用了访问口令门），
 * 弹出输码框；输对后自动重试本次请求。用户主动取消则抛出提示。
 *
 * 429（限流）不重试——那正是要让用户停下来的信号。
 */
export async function callAI<T>(path: string, body: unknown): Promise<T> {
  const send = () =>
    fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // 必须带 cookie，转发层要靠它问后端「这是谁」
      credentials: 'same-origin',
    });

  let res = await send();

  if (res.status === 401) {
    const payload = await readError(res);
    if (payload.code === 'IDENTITY_REQUIRED') {
      const identity = await ensureIdentity();
      // 拿不到身份就没必要重试了，直接把原来的错误抛出去
      if (identity) res = await send();
    }
    if (res.status === 401) {
      throw new Error(payload.error || '身份校验失败，请刷新页面重试。');
    }
  }

  if (res.status === 403) {
    const payload = await readError(res);
    if (payload.code === 'ACCESS_REQUIRED') {
      const granted = await ensureAccess();
      if (granted) res = await send();
      if (res.status === 403) {
        const again = await readError(res);
        if (again.code === 'ACCESS_REQUIRED') {
          throw new Error('需要访问口令才能继续使用，请输入口令后重试。');
        }
      }
    }
  }

  if (!res.ok) {
    const payload = await readError(res);
    throw new Error(payload.error || '请求失败');
  }

  return (await res.json()) as T;
}

/** 安全地读错误体。响应可能不是 JSON（网关返回 HTML 错误页就是这种情况）。 */
async function readError(res: Response): Promise<{ error?: string; code?: string }> {
  try {
    const text = await res.text();
    if (!text) return {};
    return JSON.parse(text) as { error?: string; code?: string };
  } catch {
    return {};
  }
}
