export type ProviderKey = 'anthropic' | 'openai' | 'deepseek' | 'zhipu' | 'custom';

export interface AppSettings {
  provider: ProviderKey;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface Round {
  question: string;
  answer: string;
}

export interface ExplorationSession {
  id: string;
  imageUrl: string | null;
  imageDescription: string;
  rounds: Round[];
  createdAt: string;
  report?: Report;
  /** 报告页「还有什么想说的吗」留下的一句话 */
  note?: string;
}

export interface Report {
  themes: string[];
  coreObservations: string;
  currentFocus: string;
  possibleExperience: string;
  innerConflicts: string;
  needs: string;
  resources: string;
  innerStrengths: string;
  reflectionQuestion: string;
  weeklyPractice: string;
  generatedAt: string;
}

export interface ThemeRecord {
  theme: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

export interface GrowthData {
  sessions: number;
  themeHistory: ThemeRecord[];
  lastExplored: string | null;
}

export interface SessionStartResponse {
  sessionId: string;
  imageUrl: string | null;
  imageDescription: string;
  firstQuestion: string;
}

export interface SessionRespondResponse {
  nextQuestion: string;
  isComplete: boolean;
}

export interface SessionCompleteResponse {
  report: Report;
}
