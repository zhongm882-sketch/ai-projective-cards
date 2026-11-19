'use client';

import { AppSettings, ExplorationSession, ThemeRecord, GrowthData } from '@/types';

const SESSIONS_KEY = 'projective_sessions';
const THEMES_KEY = 'projective_themes';
const SETTINGS_KEY = 'projective_settings';

export function getSettings(): AppSettings | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as AppSettings) : null;
  } catch {
    return null;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function isConfigured(): boolean {
  const s = getSettings();
  return !!s && !!s.apiKey.trim();
}

export function saveSession(session: ExplorationSession): void {
  if (typeof window === 'undefined') return;
  const sessions = getSessions();
  const index = sessions.findIndex((s) => s.id === session.id);
  if (index >= 0) {
    sessions[index] = session;
  } else {
    sessions.unshift(session);
  }
  // Keep only last 100 sessions
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, 100)));
}

/**
 * 最近抽过的卡片路径（越靠前越新）。
 * 传给 /api/session/start 用于避开重复抽卡。
 */
export function getRecentCardPaths(limit = 8): string[] {
  return getSessions()
    .map((s) => s.imageUrl)
    .filter((url): url is string => typeof url === 'string' && url.length > 0)
    .slice(0, limit);
}

/** 给某次探索补上「还有什么想说的」那段话。 */
export function saveSessionNote(id: string, note: string): void {
  if (typeof window === 'undefined') return;
  const sessions = getSessions();
  const index = sessions.findIndex((s) => s.id === id);
  if (index < 0) return;
  sessions[index] = { ...sessions[index], note };
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function getSessions(): ExplorationSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getSession(id: string): ExplorationSession | null {
  return getSessions().find((s) => s.id === id) ?? null;
}

// 主题种类的上限。原先没有上限，用久了这份记录会无限增长
// （会话有「只留 100 条」的限制，主题却没有）。
const MAX_THEMES = 200;

export function updateThemesFromSession(themes: string[]): void {
  if (typeof window === 'undefined') return;
  const existing = getThemeHistory();
  const now = new Date().toISOString();

  themes.forEach((theme) => {
    const record = existing.find((r) => r.theme === theme);
    if (record) {
      record.count += 1;
      record.lastSeen = now;
    } else {
      existing.push({ theme, count: 1, firstSeen: now, lastSeen: now });
    }
  });

  // 超出上限时，先淘汰出现次数最少、且最久没再出现的主题。
  let trimmed = existing;
  if (existing.length > MAX_THEMES) {
    trimmed = [...existing]
      .sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen))
      .slice(0, MAX_THEMES);
  }

  localStorage.setItem(THEMES_KEY, JSON.stringify(trimmed));
}

export function getThemeHistory(): ThemeRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(THEMES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getGrowthData(): GrowthData {
  const sessions = getSessions();
  const themeHistory = getThemeHistory().sort((a, b) => b.count - a.count);
  const lastSession = sessions[0];

  return {
    sessions: sessions.length,
    themeHistory,
    lastExplored: lastSession?.createdAt ?? null,
  };
}
