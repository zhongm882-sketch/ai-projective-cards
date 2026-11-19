'use client';

/**
 * 访问口令门（浏览器侧）。
 *
 * 用途：服务端要求口令时（403 ACCESS_REQUIRED），弹出一个输入框；
 * 输对后服务端种下通行 cookie，之后所有请求自动放行。
 *
 * 为什么做成自包含的 DOM 覆盖层而不是 React 组件：
 * 这样任何一个调用 AI 的页面都不需要额外接线，改动面最小。
 * 样式全部内联，不依赖构建期的类名扫描。
 */

let unlocked = false;
let pending: Promise<boolean> | null = null;

/** 已通过口令（由本模块在解锁成功后置位）。 */
export function markAccessGranted(): void {
  unlocked = true;
}

/** 查一次服务端：当前是否需要口令、本浏览器是否已通过。 */
async function queryAccess(): Promise<{ required: boolean; granted: boolean } | null> {
  try {
    const res = await fetch('/api/access', { credentials: 'same-origin' });
    if (!res.ok) return null;
    return (await res.json()) as { required: boolean; granted: boolean };
  } catch {
    return null;
  }
}

/**
 * 确保本浏览器已通过口令门。返回 true 表示可以继续发 AI 请求。
 * 多个并发调用共享同一个弹窗。
 */
export async function ensureAccess(): Promise<boolean> {
  if (unlocked) return true;

  const status = await queryAccess();
  if (status && !status.required) {
    unlocked = true;
    return true;
  }
  if (status?.granted) {
    unlocked = true;
    return true;
  }

  if (pending) return pending;
  pending = new Promise<boolean>((resolve) => {
    showGateOverlay(resolve);
  }).finally(() => {
    pending = null;
  });
  return pending;
}

/** 构建并展示口令输入层。resolve(true) 表示通过。 */
function showGateOverlay(resolve: (ok: boolean) => void): void {
  const overlay = document.createElement('div');
  overlay.setAttribute('data-oh-access-gate', '');
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:99999',
    'background:rgba(20,16,32,.72)', 'backdrop-filter:blur(6px)',
    'display:flex', 'align-items:center', 'justify-content:center',
    'padding:24px', 'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif',
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'width:100%', 'max-width:360px', 'background:#fff', 'border-radius:16px',
    'padding:28px 24px', 'box-shadow:0 18px 50px rgba(0,0,0,.28)',
    'color:#2b2438',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = '请输入访问口令';
  title.style.cssText = 'font-size:18px;font-weight:600;margin-bottom:8px';

  const hint = document.createElement('div');
  hint.textContent = '这是一个私人使用的小站，输入口令后即可开始探索。';
  hint.style.cssText = 'font-size:13px;color:#6b6478;line-height:1.6;margin-bottom:16px';

  const input = document.createElement('input');
  input.type = 'password';
  input.autocomplete = 'off';
  input.placeholder = '访问口令';
  input.style.cssText = [
    'width:100%', 'box-sizing:border-box', 'padding:11px 13px', 'font-size:15px',
    'border:1px solid #d8d3e0', 'border-radius:10px', 'outline:none', 'margin-bottom:10px',
  ].join(';');

  const errorLine = document.createElement('div');
  errorLine.style.cssText = 'font-size:13px;color:#c0392b;min-height:18px;margin-bottom:8px';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '进入';
  button.style.cssText = [
    'width:100%', 'padding:11px 0', 'font-size:15px', 'font-weight:600',
    'color:#fff', 'background:#6d4ac9', 'border:none', 'border-radius:10px', 'cursor:pointer',
  ].join(';');

  card.append(title, hint, input, errorLine, button);
  overlay.append(card);
  document.body.append(overlay);
  setTimeout(() => input.focus(), 30);

  let submitting = false;

  const submit = async (): Promise<void> => {
    if (submitting) return;
    const code = input.value.trim();
    if (!code) {
      errorLine.textContent = '请输入口令';
      return;
    }
    submitting = true;
    button.textContent = '验证中…';
    errorLine.textContent = '';
    try {
      const res = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
        credentials: 'same-origin',
      });
      if (res.ok) {
        unlocked = true;
        overlay.remove();
        resolve(true);
        return;
      }
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      errorLine.textContent = payload.error || '口令不正确，请重试。';
      input.select();
    } catch {
      errorLine.textContent = '网络异常，请稍后重试。';
    } finally {
      submitting = false;
      button.textContent = '进入';
    }
  };

  button.addEventListener('click', () => void submit());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void submit();
  });

  // 不提供"取消后继续"——没有口令就用不了 AI，取消等于放弃本次操作
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = '暂不使用';
  cancel.style.cssText = 'width:100%;margin-top:10px;padding:9px 0;font-size:13px;color:#6b6478;background:none;border:none;cursor:pointer';
  cancel.addEventListener('click', () => {
    overlay.remove();
    resolve(false);
  });
  card.append(cancel);
}
