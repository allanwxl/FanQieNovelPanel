import Dexie, { type Table } from "dexie";
import type { PromotionMark, SyncState, Work, WorkDailyStats } from "../shared/types";

export class FanqiePanelDatabase extends Dexie {
  works!: Table<Work, string>;
  workDailyStats!: Table<WorkDailyStats, number>;
  promotionMarks!: Table<PromotionMark, string>;
  syncState!: Table<SyncState & { id: string }, string>;

  constructor() {
    super("fanqie_short_story_panel");

    this.version(1).stores({
      works: "platformWorkId, title, status, updatedAt",
      workDailyStats: "++id, [platformWorkId+statDate], platformWorkId, statDate",
      promotionMarks: "platformWorkId, state, updatedAt",
      syncState: "id, status, lastSyncedAt"
    });
  }
}
