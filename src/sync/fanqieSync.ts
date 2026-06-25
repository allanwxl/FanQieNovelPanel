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
const SYNC_DAYS = 60;
const REQUEST_DELAY_MS = 250;

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

const fetchStatsForWork = async (work: Work) => {
  const endDate = yesterday();
  const startDate = dayjs(endDate).subtract(SYNC_DAYS - 1, "day").format("YYYY-MM-DD");

  try {
    const byDateResult = await fanqieGet<unknown>({
      path: fanqieEndpoints.shortStatsSingleByDate,
      query: {
        book_id: work.platformWorkId,
        start_date: startDate,
        end_date: endDate
      }
    });
    const byDateData = ensureOk(`作品 ${work.platformWorkId} 日期指标`, byDateResult);
    const items = extractFanqieList(byDateData);
    const stats = items.map((item) => normalizeDailyStats(item, work.platformWorkId));

    if (stats.length > 0) return stats;
  } catch {
    // singleByDate 失败时尝试 singleCommon
  }

  const commonResult = await fanqieGet<unknown>({
    path: fanqieEndpoints.shortStatsSingleCommon,
    query: { book_id: work.platformWorkId }
  });
  const commonData = ensureOk(`作品 ${work.platformWorkId} 累计指标`, commonResult);
  return [normalizeCommonStatsAsDaily(commonData, work.platformWorkId, endDate)];
};

export const syncFanqieData = async (): Promise<SyncResult> => {
  const startedAt = new Date().toISOString();
  await db.syncState.put({
    id: "main",
    status: "running",
    message: "正在同步番茄后台数据...",
    lastSyncedAt: startedAt
  });

  try {
    const userInfo = await fanqieGet<unknown>({ path: fanqieEndpoints.userInfo });
    ensureOk("登录态", userInfo);

    const works = await fetchWorks();
    if (works.length === 0) throw new Error("作品列表为空，请确认账号下有短故事数据。");

    const stats: WorkDailyStats[] = [];
    let failedStatsCount = 0;
    for (const work of works) {
      try {
        stats.push(...(await fetchStatsForWork(work)));
      } catch (error) {
        failedStatsCount += 1;
        stats.push(
          normalizeCommonStatsAsDaily(
            {
              sync_error: error instanceof Error ? error.message : String(error)
            },
            work.platformWorkId,
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
      await db.workDailyStats.clear();
      await db.works.bulkPut(works);
      await db.workDailyStats.bulkPut(dedupedStats);
      await db.syncState.put({
        id: "main",
        status: "success",
        lastSyncedAt: syncedAt,
        message:
          failedStatsCount > 0
            ? `已同步 ${works.length} 部作品、${dedupedStats.length} 条日期指标；${failedStatsCount} 部作品暂无可用指标。`
            : `已同步 ${works.length} 部作品、${dedupedStats.length} 条日期指标。`
      });
    });

    return {
      ok: true,
      worksSynced: works.length,
      statsSynced: dedupedStats.length,
      syncedAt
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.syncState.put({
      id: "main",
      status: "failed",
      lastSyncedAt: new Date().toISOString(),
      message
    });
    return { ok: false, error: message };
  }
};
