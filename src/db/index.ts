import { FanqiePanelDatabase } from "./schema";
import type { PromotionMark, SyncState, Work, WorkDailyStats } from "../shared/types";

export const db = new FanqiePanelDatabase();

export const loadDashboardData = async (): Promise<{
  works: Work[];
  stats: WorkDailyStats[];
  marks: PromotionMark[];
  syncState: SyncState;
}> => {
  const [works, stats, marks, syncState] = await Promise.all([
    db.works.toArray(),
    db.workDailyStats.toArray(),
    db.promotionMarks.toArray(),
    db.syncState.get("main")
  ]);

  return {
    works,
    stats,
    marks,
    syncState: syncState ?? { status: "idle" }
  };
};

export const updatePromotionMark = async (mark: PromotionMark) => {
  await db.promotionMarks.put(mark);
};
