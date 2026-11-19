'use client';

import { ExplorationSession, GrowthData } from '@/types';

/**
 * 后端同步客户端。
 *
 * 设计原则：同步失败绝不影响本地使用。
 * 这个产品的核心价值是「完成一次自我探索」，同步只是附加的跨设备能力——
 * 后端挂了、网络断了、用户没登录，探索流程都必须照常走完。
 * 因此这里所有函数都不抛错，失败返回 null / false，由调用方决定是否提示。
 */

const DEVICE_KEY = 'projective_device_key';
const SYNC_STATE_KEY = 'projective_sync_state';

export interface Identity {
  type: 'user' | 'guest';
  email?: string;
  /**
   * 身份的稳定引用值（后端 HMAC 派生）。转发层用它作限流 key。
   * 前端不需要读它，声明出来只是为了类型完整。
   */
  ref?: string;
}

interface SyncState {
  /** 已成功同步到后端的本地会话 id，避免重复上传 */
  syncedIds: string[];
  /** 后端是否可用。false 时暂停自动同步，不再反复请求失败。 */
  available: boolean;
}

function readSyncState(): SyncState {
  if (typeof window === 'undefined') return { syncedIds: [], available: true };
  try {
    const raw = localStorage.getItem(SYNC_STATE_KEY);
    if (!raw) return { syncedIds: [], available: true };
    const parsed = JSON.parse(raw) as Partial<SyncState>;
    return {
      syncedIds: Array.isArray(parsed.syncedIds) ? parsed.syncedIds : [],
      available: parsed.available !== false,
    };
  } catch {
    return { syncedIds: [], available: true };
  }
}

function writeSyncState(state: SyncState): void {
  if (typeof window === 'undefined') return;
  // 只保留最近 200 条已同步记录，避免这份状态无限增长
  localStorage.setItem(
    SYNC_STATE_KEY,
    JSON.stringify({ ...state, syncedIds: state.syncedIds.slice(-200) })
  );
}

export function isSynced(sessionId: string): boolean {
  return readSyncState().syncedIds.includes(sessionId);
}

function markSynced(sessionId: string): void {
  const state = readSyncState();
  if (!state.syncedIds.includes(sessionId)) {
    state.syncedIds.push(sessionId);
    writeSyncState(state);
  }
}

/**
 * 设备标识。
 *
 * 用 crypto.randomUUID 而不是自己拼随机数——后者在并发或低熵环境下会撞。
 * 存在 localStorage：清缓存会丢身份，这是游客模式的固有代价，
 * 想跨设备就注册账号。
 */
export function getDeviceKey(): string {
  if (typeof window === 'undefined') return '';
  let key = localStorage.getItem(DEVICE_KEY);
  if (!key) {
    // 后端要求至少 16 个字符，UUID 是 36 个，够了
    key = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, key);
  }
  return key;
}

/** 统一的请求封装。失败返回 null，绝不抛错。 */
async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  try {
    const res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
      // 必须带上 cookie，否则后端认不出身份
      credentials: 'same-origin',
    });

    const text = await res.text();
    const body = text ? (JSON.parse(text) as unknown) : {};

    if (!res.ok) {
      const error =
        typeof body === 'object' && body !== null && 'error' in body
          ? String((body as { error: unknown }).error)
          : '请求失败';
      return { ok: false, status: res.status, error };
    }

    return { ok: true, data: body as T };
  } catch {
    // 网络错误、JSON 解析失败都归到这里。0 表示「根本没连上」。
    return { ok: false, status: 0, error: '网络错误' };
  }
}

/**
 * 确保有可用身份。
 *
 * 没有身份时自动换一个游客 token——用户不需要为了「保存记录」先注册。
 * 返回当前身份，失败返回 null（此时纯本地模式）。
 */
export async function ensureIdentity(): Promise<Identity | null> {
  const me = await request<{ identity: Identity | null }>('/api/auth/me');
  if (me.ok && me.data.identity) return me.data.identity;

  // 访问 token 过期时先尝试刷新，避免每次都新建一个游客身份
  const refreshed = await request<{ ok: boolean }>('/api/auth/refresh', { method: 'POST' });
  if (refreshed.ok) {
    const retry = await request<{ identity: Identity | null }>('/api/auth/me');
    if (retry.ok && retry.data.identity) return retry.data.identity;
  }

  // 后端不可用（503 / 网络错误）时不要反复尝试
  const guest = await request<{ identity: Identity }>('/api/auth/guest', {
    method: 'POST',
    body: JSON.stringify({ deviceKey: getDeviceKey() }),
  });

  if (!guest.ok) {
    if (guest.status === 503 || guest.status === 0) {
      writeSyncState({ ...readSyncState(), available: false });
    }
    return null;
  }

  writeSyncState({ ...readSyncState(), available: true });
  return guest.data.identity;
}

/** 当前身份，不主动创建。用于界面显示。 */
export async function getIdentity(): Promise<Identity | null> {
  const me = await request<{ identity: Identity | null }>('/api/auth/me');
  return me.ok ? me.data.identity : null;
}

export async function register(
  email: string,
  password: string,
  phone?: string
): Promise<{ ok: true; identity: Identity; migrated: number } | { ok: false; error: string }> {
  const res = await request<{ identity: Identity; migrated: number }>('/api/auth/register', {
    method: 'POST',
    // 带上 deviceKey，把游客期间的探索迁移到新账号
    body: JSON.stringify({ email, password, phone, deviceKey: getDeviceKey() }),
  });

  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, identity: res.data.identity, migrated: res.data.migrated };
}

export async function login(
  email: string,
  password: string
): Promise<{ ok: true; identity: Identity } | { ok: false; error: string }> {
  const res = await request<{ identity: Identity }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, identity: res.data.identity };
}

export async function logout(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST' });
}

/**
 * 上传一次探索。
 *
 * 用本地会话 id 作为 clientId，后端据此幂等——
 * 重试或重复调用不会产生两条记录。
 */
export async function uploadExploration(session: ExplorationSession): Promise<boolean> {
  if (!session.report) return false;

  const { report } = session;
  const payload = {
    clientId: session.id,
    cardPath: session.imageUrl,
    cardDescription: session.imageDescription,
    rounds: session.rounds,
    report: {
      themes: report.themes,
      // 后端的 prose 不含 themes 和 generatedAt，它们分开存
      prose: {
        coreObservations: report.coreObservations,
        currentFocus: report.currentFocus,
        possibleExperience: report.possibleExperience,
        innerConflicts: report.innerConflicts,
        needs: report.needs,
        resources: report.resources,
        innerStrengths: report.innerStrengths,
        reflectionQuestion: report.reflectionQuestion,
        weeklyPractice: report.weeklyPractice,
      },
      generatedAt: report.generatedAt,
    },
  };

  const res = await request<{ id: string }>('/api/explorations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    markSynced(session.id);
    return true;
  }

  // 401 说明身份失效，换一个身份再试一次
  if (res.status === 401) {
    const identity = await ensureIdentity();
    if (identity) {
      const retry = await request<{ id: string }>('/api/explorations', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (retry.ok) {
        markSynced(session.id);
        return true;
      }
    }
  }

  if (res.status === 503 || res.status === 0) {
    writeSyncState({ ...readSyncState(), available: false });
  }

  return false;
}

/** 上传留言。 */
export async function uploadNote(
  clientId: string,
  note: string
): Promise<boolean> {
  // 后端按自己的 uuid 主键定位记录，所以要先查出它的 id
  const remote = await findRemoteId(clientId);
  if (!remote) return false;

  const res = await request(`/api/explorations/${remote}/note`, {
    method: 'PATCH',
    body: JSON.stringify({ note }),
  });
  return res.ok;
}

/** 用本地 clientId 找后端记录 id。 */
async function findRemoteId(clientId: string): Promise<string | null> {
  const res = await request<{ items: { id: string; clientId: string | null }[] }>(
    '/api/explorations?limit=100'
  );
  if (!res.ok) return null;
  return res.data.items.find((i) => i.clientId === clientId)?.id ?? null;
}

export interface RemoteSummary {
  id: string;
  clientId: string | null;
  cardPath: string | null;
  roundCount: number;
  themes: string[];
  hasNote: boolean;
  createdAt: string;
}

/** 拉取远端探索列表。失败返回 null（调用方回退到本地数据）。 */
export async function fetchExplorations(
  limit = 50,
  offset = 0
): Promise<{ items: RemoteSummary[]; total: number } | null> {
  const res = await request<{ items: RemoteSummary[]; total: number }>(
    `/api/explorations?limit=${limit}&offset=${offset}`
  );
  return res.ok ? res.data : null;
}

/** 拉取远端成长数据。 */
export async function fetchGrowth(): Promise<GrowthData | null> {
  const res = await request<GrowthData>('/api/growth');
  return res.ok ? res.data : null;
}

/** 拉取单条远端记录（含解密后的完整内容）。 */
export async function fetchExploration(
  id: string
): Promise<ExplorationSession | null> {
  const res = await request<{
    id: string;
    clientId: string | null;
    cardPath: string | null;
    cardDescription: string | null;
    rounds: { question: string; answer: string }[];
    note: string | null;
    createdAt: string;
    report: {
      themes: string[];
      prose: Record<string, string>;
      generatedAt: string;
    } | null;
  }>(`/api/explorations/${id}`);

  if (!res.ok) return null;
  const d = res.data;

  return {
    // 用 clientId 作为对外的 id，保证和本地记录能对上
    id: d.clientId ?? d.id,
    imageUrl: d.cardPath,
    imageDescription: d.cardDescription ?? '',
    rounds: d.rounds,
    createdAt: d.createdAt,
    note: d.note ?? undefined,
    report: d.report
      ? {
          themes: d.report.themes,
          coreObservations: d.report.prose.coreObservations ?? '',
          currentFocus: d.report.prose.currentFocus ?? '',
          possibleExperience: d.report.prose.possibleExperience ?? '',
          innerConflicts: d.report.prose.innerConflicts ?? '',
          needs: d.report.prose.needs ?? '',
          resources: d.report.prose.resources ?? '',
          innerStrengths: d.report.prose.innerStrengths ?? '',
          reflectionQuestion: d.report.prose.reflectionQuestion ?? '',
          weeklyPractice: d.report.prose.weeklyPractice ?? '',
          generatedAt: d.report.generatedAt,
        }
      : undefined,
  };
}

export async function deleteRemoteExploration(id: string): Promise<boolean> {
  const res = await request(`/api/explorations/${id}`, { method: 'DELETE' });
  return res.ok;
}

/**
 * 把本地尚未同步的记录批量补传。
 *
 * 在什么时候调：拿到身份之后、进入历史页时。
 * 串行而非并发：这不是要抢速度的场景，并发反而容易撞上限流。
 */
export async function syncPending(sessions: ExplorationSession[]): Promise<number> {
  if (!readSyncState().available) return 0;

  let uploaded = 0;
  for (const session of sessions) {
    if (!session.report || isSynced(session.id)) continue;
    const ok = await uploadExploration(session);
    if (ok) uploaded++;
    // 一旦失败就停下——通常意味着后端不可用，继续试只是浪费请求
    else break;
  }
  return uploaded;
}
