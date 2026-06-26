import dayjs from "dayjs";
import type { Work, WorkDailyStats, WorkStatus } from "../shared/types";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
};

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/,/g, "").replace("%", "").trim();
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return value.includes("%") ? parsed / 100 : parsed;
  }
  return undefined;
};

const getPath = (source: unknown, path: string): unknown => {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined;
    return current[key];
  }, source);
};

const firstString = (source: unknown, paths: string[]) => {
  for (const path of paths) {
    const raw = getPath(source, path);
    if (Array.isArray(raw) && raw.length > 0) {
      const value = asString(raw[0]);
      if (value) return value;
    } else {
      const value = asString(raw);
      if (value) return value;
    }
  }
  return undefined;
};

const firstNumber = (source: unknown, paths: string[]) => {
  for (const path of paths) {
    const value = asNumber(getPath(source, path));
    if (value !== undefined) return value;
  }
  return undefined;
};

const firstRatio = (source: unknown, paths: string[]) => {
  const value = firstNumber(source, paths);
  if (value === undefined) return undefined;
  return value > 1 ? value / 100 : value;
};

const normalizeDate = (value: string | undefined) => {
  if (!value) return dayjs().subtract(1, "day").format("YYYY-MM-DD");
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 1_000_000_000) {
    return dayjs(numeric > 9_999_999_999 ? numeric : numeric * 1000).format("YYYY-MM-DD");
  }
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("YYYY-MM-DD") : dayjs().subtract(1, "day").format("YYYY-MM-DD");
};

const normalizeStatus = (value: string | undefined): WorkStatus => {
  if (!value) return "unknown";
  if (["finished", "finish", "completed", "完结", "已完结", "2"].includes(value)) return "finished";
  if (["publishing", "serial", "ongoing", "连载", "连载中", "1"].includes(value)) return "publishing";
  return "unknown";
};

const extractList = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];

  const candidates = [
    payload.list,
    payload.book_list,
    payload.item_list,
    payload.bookList,
    payload.itemList,
    payload.books,
    payload.items,
    payload.records,
    isRecord(payload.data) ? payload.data.list : undefined,
    isRecord(payload.data) ? payload.data.book_list : undefined,
    isRecord(payload.data) ? payload.data.item_list : undefined,
    isRecord(payload.data) ? payload.data.items : undefined
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
};

export const extractFanqieList = extractList;

export const normalizeWork = (item: unknown): Work | null => {
  if (!isRecord(item)) {
    return null;
  }

  const platformWorkId = firstString(item, [
    "book_id",
    "bookId",
    "book_id_str",
    "bookIdStr",
    "id",
    "book.id",
    "book.book_id",
    "book_info.book_id",
    "bookInfo.bookId",
    "item_id",
    "itemId"
  ]);

  const title = firstString(item, [
    "title",
    "item_title",
    "itemTitle",
    "multi_title",
    "multiTitle",
    "book_name",
    "bookName",
    "book_title",
    "name",
    "article_title",
    "book.title",
    "book.name",
    "book_info.book_name",
    "bookInfo.bookName"
  ]);

  if (!platformWorkId || !title) return null;

  const now = new Date().toISOString();
  const statusText = firstString(item, [
    "status",
    "book_status",
    "creation_status",
    "serialize_status",
    "item_status",
    "itemStatus",
    "audit_status",
    "auditStatus",
    "book.status",
    "book_info.status"
  ]);

  return {
    platformWorkId,
    itemId: firstString(item, ["item_id", "itemId", "article_id", "articleId"]),
    title,
    status: normalizeStatus(statusText),
    signStatus: firstString(item, [
      "sign_status",
      "signStatus",
      "contract_status",
      "contractStatus",
      "book_info.sign_status"
    ]),
    coverUrl: firstString(item, [
      "cover_url",
      "coverUrl",
      "thumb_url",
      "thumbUrl",
      "image_url",
      "book_info.thumb_url",
      "bookInfo.thumbUrl"
    ]),
    publishTime: firstString(item, [
      "publish_time",
      "publishTime",
      "create_time",
      "createTime",
      "first_publish_time",
      "book_info.create_time"
    ]),
    createdAt: now,
    updatedAt: now
  };
};

export const normalizeDailyStats = (
  item: unknown,
  platformWorkId: string,
  fallbackDate?: string
): WorkDailyStats => {
  const statDate = normalizeDate(
    firstString(item, ["stat_date", "statDate", "date", "dt", "day", "event_date"]) ?? fallbackDate
  );
  const impressions = firstNumber(item, [
    "impression_count",
    "impressions",
    "show_count",
    "show_cnt",
    "show_pv",
    "exposure_count",
    "total_show_count",
    "total_impression_count",
    "yesterday_sum_show_count"
  ]) ?? 0;
  const readers = firstNumber(item, [
    "read_count",
    "reader_count",
    "readers",
    "read_pv",
    "read_uv",
    "total_read_count",
    "click_count",
    "click_cnt",
    "yesterday_sum_read_count"
  ]) ?? 0;
  const clickRate = firstRatio(item, ["click_rate", "clickRate"]);
  const clicks = firstNumber(item, ["click_count", "click_cnt", "clicks"]) ??
    (clickRate !== undefined ? impressions * clickRate : readers);
  const readCompletionRate = firstRatio(item, [
    "read_completion_rate",
    "readCompletionRate",
    "completion_rate",
    "complete_rate",
    "finish_rate",
    "read_100_percent_rate",
    "bottom_rate"
  ]);
  const finishedReaders = firstNumber(item, [
    "finish_read_count",
    "finished_readers",
    "finishedReaders",
    "read_finish_count",
    "read_end_count",
    "complete_read_count",
    "read_100_percent_count",
    "read_count_100_percent",
    "yesterday_sum_read_100_percent_count"
  ]) ?? (readCompletionRate !== undefined ? readers * readCompletionRate : null);

  return {
    platformWorkId,
    statDate,
    impressions,
    clicks,
    readers,
    retention15s: firstNumber(item, [
      "retention_15s",
      "retention15s",
      "stay_15s_rate",
      "read_count_15s",
      "yesterday_sum_read_count_15s"
    ]) ?? null,
    retention30s: firstNumber(item, [
      "retention_30s",
      "retention30s",
      "stay_30s_rate",
      "read_count_30s",
      "yesterday_sum_read_count_30s"
    ]) ?? null,
    retention60s: firstNumber(item, [
      "retention_60s",
      "retention60s",
      "stay_60s_rate",
      "read_count_60s",
      "yesterday_sum_read_count_60s"
    ]) ?? null,
    finishedReaders,
    readCompletionRate: readCompletionRate ?? null,
    groupHeat: firstNumber(item, ["group_heat", "groupHeat", "channel_heat", "heat"]) ?? null,
    comments: firstNumber(item, ["comment_count", "comments", "comment_cnt"]) ?? 0,
    likes: firstNumber(item, ["digg_count", "like_count", "likes", "digg_cnt"]) ?? 0,
    shelves: firstNumber(item, ["collect_count", "shelf_count", "shelves", "bookshelf_count"]) ?? 0,
    internalTraffic: firstNumber(item, ["internal_traffic", "inner_traffic", "in_site_read_count"]) ?? null,
    externalTraffic: firstNumber(item, ["external_traffic", "outer_traffic", "out_site_read_count"]) ?? null,
    raw: item
  };
};

export const normalizeCommonStatsAsDaily = (
  data: unknown,
  platformWorkId: string,
  fallbackDate: string
): WorkDailyStats => normalizeDailyStats(data, platformWorkId, fallbackDate);
