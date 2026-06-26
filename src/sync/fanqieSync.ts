import dayjs from "dayjs";
import { fanqieEndpoints, fanqieGet } from "../client/fanqieApi";
import { db } from "../db";
import type { SyncResult, Work, WorkDailyStats } from "../shared/types";
import {
  extractFanqieList,
  normalizeCommonStatsAsDaily,
  normalizeDailyStats,
  normalizeWork
} from "./normalize";

const PAGE_SIZE = 20;
const MAX_PAGES = 20;
const DEFAULT_LOOKBACK_DAYS = 14;
const REQUEST_DELAY_MS = 120;

const sleep = (ms: number) => new Promise((resolve) => globalThis.setTimeout(resolve, ms));

const yesterday = () => dayjs().subtract(1, "day").format("YYYY-MM-DD");

const ensureOk = <T>(label: string, result: { code: number; message?: string; data?: T }) => {
  if (result.code !== 0) {
    throw new Error(`${label} 请求失败：${result.message ?? result.code}`);
  }
  return result.data;
};

const uniqueById = (works: Work[]) => {
  const map = new Map<string, Work>();
  for (const work of works) map.set(work.platformWorkId, work);
  return [...map.values()];
};

const uniqueStats = (stats: WorkDailyStats[]) => {
  const map = new Map<string, WorkDailyStats>();
  for (const item of stats) map.set(`${item.platformWorkId}:${item.statDate}`, item);
  return [...map.values()];
};

const updateSyncProgress = async (current: number, total: number, prefix = "正在同步指标") => {
  await db.syncState.put({
    id: "main",
    status: "running",
    lastSyncedAt: new Date().toISOString(),
    message: total > 0 ? `${prefix} ${current}/${total}` : "作品列表已同步，暂无缺失日期指标。",
    progressCurrent: current,
    progressTotal: total
  });
};

const getMissingStatDates = async (workId: string) => {
  const endDate = yesterday();
  const existing = await db.workDailyStats
    .where("[platformWorkId+statDate]")
    .between(
      [workId, dayjs(endDate).subtract(DEFAULT_LOOKBACK_DAYS - 1, "day").format("YYYY-MM-DD")],
      [workId, endDate]
    )
    .toArray();
  const existingDates = new Set(existing.map((item) => item.statDate));
  const missingDates: string[] = [];

  for (let offset = DEFAULT_LOOKBACK_DAYS - 1; offset >= 0; offset -= 1) {
    const statDate = dayjs(endDate).subtract(offset, "day").format("YYYY-MM-DD");
    if (!existingDates.has(statDate)) missingDates.push(statDate);
  }

  return missingDates;
};

const fetchStatsBookListWorks = async () => {
  const works: Work[] = [];

  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    const result = await fanqieGet<unknown>({
      path: fanqieEndpoints.shortStatsBookList,
      query: {
        page_index: pageIndex,
        page_count: PAGE_SIZE,
        image_fmt_list: "450x800",
        book_image_fmt_list: "190x250"
      }
    });
    const data = ensureOk("作品列表", result);
    const items = extractFanqieList(data);
    works.push(...items.map(normalizeWork).filter((item): item is Work => item !== null));

    if (items.length < PAGE_SIZE) break;
    await sleep(REQUEST_DELAY_MS);
  }

  return uniqueById(works);
};

const fetchShortArticleWorks = async () => {
  const works: Work[] = [];

  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    const result = await fanqieGet<unknown>({
      path: fanqieEndpoints.shortArticleList,
      query: {
        page_index: pageIndex,
        page_count: PAGE_SIZE,
        status: 0,
        time_sort: 0,
        image_fmt_list: "450x800",
        book_image_fmt_list: "190x250",
        pack_type: 1
      }
    });
    const data = ensureOk("短故事作品列表", result);
    const items = extractFanqieList(data);
    works.push(...items.map(normalizeWork).filter((item): item is Work => item !== null));

    if (items.length < PAGE_SIZE) break;
    await sleep(REQUEST_DELAY_MS);
  }

  return uniqueById(works);
};

const fetchWorks = async () => {
  const statsWorks = await fetchStatsBookListWorks();
  if (statsWorks.length > 0) return statsWorks;
  return fetchShortArticleWorks();
};

const fetchStatsForWork = async (
  work: Work,
  missingDates: string[],
  onDateSynced: () => Promise<void>
) => {
  const stats: WorkDailyStats[] = [];

  for (const statDate of missingDates) {
    try {
      const byDateResult = await fanqieGet<unknown>({
        path: fanqieEndpoints.shortStatsSingleByDate,
        query: {
          book_id: work.platformWorkId,
          start_date: statDate,
          end_date: statDate
        }
      });
      const byDateData = ensureOk(`作品 ${work.platformWorkId} ${statDate} 日期指标`, byDateResult);
      const items = extractFanqieList(byDateData);
      console.debug(`[fanqie-sync] singleByDate book=${work.platformWorkId} date=${statDate} items=${items.length} raw=`, items.length > 0 ? items[0] : byDateData);

      if (items.length > 0) {
        stats.push(...items.map((item) => normalizeDailyStats(item, work.platformWorkId, statDate)));
      } else if (byDateData && typeof byDateData === "object" && !Array.isArray(byDateData)) {
        stats.push(normalizeDailyStats(byDateData, work.platformWorkId, statDate));
      }
    } catch {
      // Keep syncing other dates and use the cumulative fallback if no daily data is available at all.
    }

    await onDateSynced();
    await sleep(REQUEST_DELAY_MS);
  }

  if (stats.length > 0) return stats;

  if (missingDates.length === 0) return stats;

  const commonResult = await fanqieGet<unknown>({
    path: fanqieEndpoints.shortStatsSingleCommon,
    query: { book_id: work.platformWorkId }
  });
  const commonData = ensureOk(`作品 ${work.platformWorkId} 累计指标`, commonResult);
  console.debug(`[fanqie-sync] singleCommon book=${work.platformWorkId} raw=`, commonData);
  return [normalizeCommonStatsAsDaily(commonData, work.platformWorkId, yesterday())];
};

export const syncFanqieData = async (): Promise<SyncResult> => {
  const startedAt = new Date().toISOString();
  await db.syncState.put({
    id: "main",
    status: "running",
    message: "正在读取作品列表...",
    lastSyncedAt: startedAt,
    progressCurrent: 0,
    progressTotal: 0
  });

  try {
    const userInfo = await fanqieGet<unknown>({ path: fanqieEndpoints.userInfo });
    ensureOk("登录态", userInfo);

    const works = await fetchWorks();
    if (works.length === 0) throw new Error("作品列表为空，请确认账号下有短故事数据。");

    const workPlans = await Promise.all(
      works.map(async (work) => ({
        work,
        missingDates: await getMissingStatDates(work.platformWorkId)
      }))
    );
    const progressTotal = workPlans.reduce((total, plan) => total + plan.missingDates.length, 0);
    let progressCurrent = 0;
    await updateSyncProgress(progressCurrent, progressTotal);

    const stats: WorkDailyStats[] = [];
    let failedStatsCount = 0;
    for (const plan of workPlans) {
      try {
        stats.push(
          ...(await fetchStatsForWork(plan.work, plan.missingDates, async () => {
            progressCurrent += 1;
            await updateSyncProgress(progressCurrent, progressTotal);
          }))
        );
      } catch (error) {
        failedStatsCount += 1;
        stats.push(
          normalizeCommonStatsAsDaily(
            {
              sync_error: error instanceof Error ? error.message : String(error)
            },
            plan.work.platformWorkId,
            yesterday()
          )
        );
      }
      await sleep(REQUEST_DELAY_MS);
    }

    const dedupedStats = uniqueStats(stats);
    const syncedAt = new Date().toISOString();
    await db.transaction("rw", db.works, db.workDailyStats, db.syncState, async () => {
      await db.works.clear();
      await db.works.bulkPut(works);
      if (dedupedStats.length > 0) await db.workDailyStats.bulkPut(dedupedStats);
      await db.syncState.put({
        id: "main",
        status: "success",
        lastSyncedAt: syncedAt,
        progressCurrent,
        progressTotal,
        message:
          failedStatsCount > 0
            ? `已同步 ${works.length} 部作品，新增 ${dedupedStats.length} 条日期指标；${failedStatsCount} 部作品暂无可用指标。`
            : `已同步 ${works.length} 部作品，新增 ${dedupedStats.length} 条日期指标。`
      });
    });

    return {
      ok: true,
      worksSynced: works.length,
      statsSynced: dedupedStats.length,
      progressTotal,
      syncedAt
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.syncState.put({
      id: "main",
      status: "failed",
      lastSyncedAt: new Date().toISOString(),
      message,
      progressCurrent: 0,
      progressTotal: 0
    });
    return { ok: false, error: message };
  }
};
