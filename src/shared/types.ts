export type WorkStatus = "publishing" | "finished" | "unknown";

export type TimeRangePreset = "yesterday" | "7d" | "14d" | "30d" | "custom";

export type PromotionState = "unpromoted" | "promoted" | "watch";

export type Work = {
  platformWorkId: string;
  itemId?: string;
  title: string;
  status: WorkStatus;
  signStatus?: string;
  coverUrl?: string;
  publishTime?: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkDailyStats = {
  id?: number;
  platformWorkId: string;
  statDate: string;
  impressions: number;
  clicks: number;
  readers: number;
  retention15s?: number | null;
  retention30s?: number | null;
  retention60s?: number | null;
  finishedReaders?: number | null;
  groupHeat?: number | null;
  comments: number;
  likes: number;
  shelves: number;
  internalTraffic?: number | null;
  externalTraffic?: number | null;
  raw?: unknown;
};

export type PromotionMark = {
  platformWorkId: string;
  state: PromotionState;
  promotedAt?: string;
  channel?: string;
  note?: string;
  updatedAt: string;
};

export type SyncState = {
  status: "idle" | "running" | "success" | "failed";
  lastSyncedAt?: string;
  message?: string;
};

export type SyncResult = {
  ok: boolean;
  worksSynced?: number;
  statsSynced?: number;
  error?: string;
  syncedAt?: string;
};

export type AggregatedWork = {
  work: Work;
  promotion?: PromotionMark;
  impressions: number;
  clicks: number;
  readers: number;
  finishedReaders: number;
  groupHeat: number;
  comments: number;
  likes: number;
  shelves: number;
  clickRate: number;
  readCompletionRate: number;
  shelfRate: number;
  growthRate7d: number | null;
  score: number;
  scoreLabel: "优先推广" | "观察" | "普通";
};

export type FanqieApiResult<T> = {
  code: number;
  message?: string;
  data?: T;
};
