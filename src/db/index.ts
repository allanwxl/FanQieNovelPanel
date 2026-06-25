import { FanqiePanelDatabase } from "./schema";
import { createMockDataset } from "../domain/mockData";
import type { PromotionMark, SyncState, Work, WorkDailyStats } from "../shared/types";

export const db = new FanqiePanelDatabase();

export const seedMockData = async () => {
  const count = await db.works.count();
  if (count > 0) return;

  const { works, stats, marks } = createMockDataset();
  await db.transaction("rw", db.works, db.workDailyStats, db.promotionMarks, db.syncState, async () => {
    await db.works.bulkPut(works);
    await db.workDailyStats.bulkPut(stats);
    await db.promotionMarks.bulkPut(marks);
    await db.syncState.put({
      id: "main",
      status: "success",
      lastSyncedAt: new Date().toISOString(),
      message: "已载入本地演示数据，等待接入真实接口。"
    });
  });
};

export const loadDashboardData = async (): Promise<{
  works: Work[];
  stats: WorkDailyStats[];
  marks: PromotionMark[];
  syncState: SyncState;
}> => {
  await seedMockData();

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
