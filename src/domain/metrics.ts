import dayjs from "dayjs";
import type { AggregatedWork, PromotionMark, Work, WorkDailyStats } from "../shared/types";

const safeRatio = (numerator: number, denominator: number) => {
  if (!denominator) return 0;
  return numerator / denominator;
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const completionRateFromStats = (items: WorkDailyStats[]) => {
  const readers = sum(items.map((item) => item.readers));
  const finishedReaders = sum(items.map((item) => item.finishedReaders ?? 0));
  if (finishedReaders > 0) return safeRatio(finishedReaders, readers);

  const weightedRate = sum(
    items.map((item) => (item.readCompletionRate ?? 0) * (item.readers || 1))
  );
  const weight = sum(
    items.map((item) =>
      item.readCompletionRate === null || item.readCompletionRate === undefined ? 0 : item.readers || 1
    )
  );
  return safeRatio(weightedRate, weight);
};

const finishedReadersFromStats = (items: WorkDailyStats[]) => {
  const explicit = sum(items.map((item) => item.finishedReaders ?? 0));
  if (explicit > 0) return explicit;
  return sum(items.map((item) => (item.readCompletionRate ?? 0) * item.readers));
};

const inRange = (date: string, start: string, end: string) => {
  const day = dayjs(date);
  return (day.isAfter(dayjs(start)) || day.isSame(dayjs(start), "day")) &&
    (day.isBefore(dayjs(end)) || day.isSame(dayjs(end), "day"));
};

export const getRangeDates = (preset: "yesterday" | "7d" | "14d" | "30d") => {
  const latestDataDay = dayjs().subtract(1, "day");
  if (preset === "yesterday") {
    return {
      start: latestDataDay.format("YYYY-MM-DD"),
      end: latestDataDay.format("YYYY-MM-DD")
    };
  }

  const days = Number(preset.replace("d", ""));
  return {
    start: latestDataDay.subtract(days - 1, "day").format("YYYY-MM-DD"),
    end: latestDataDay.format("YYYY-MM-DD")
  };
};

export const aggregateWorks = (
  works: Work[],
  stats: WorkDailyStats[],
  marks: PromotionMark[],
  startDate: string,
  endDate: string
): AggregatedWork[] => {
  const statsByWork = new Map<string, WorkDailyStats[]>();
  const markByWork = new Map(marks.map((mark) => [mark.platformWorkId, mark]));

  for (const item of stats) {
    if (!inRange(item.statDate, startDate, endDate)) continue;
    const items = statsByWork.get(item.platformWorkId) ?? [];
    items.push(item);
    statsByWork.set(item.platformWorkId, items);
  }

  const baseline = works.map((work) => {
    const items = statsByWork.get(work.platformWorkId) ?? [];
    return {
      impressions: sum(items.map((item) => item.impressions)),
      clickRate: safeRatio(sum(items.map((item) => item.clicks)), sum(items.map((item) => item.impressions))),
      completionRate: completionRateFromStats(items)
    };
  });

  const avgImpressions = safeRatio(sum(baseline.map((item) => item.impressions)), Math.max(baseline.length, 1));
  const avgClickRate = safeRatio(sum(baseline.map((item) => item.clickRate)), Math.max(baseline.length, 1));
  const avgCompletionRate = safeRatio(sum(baseline.map((item) => item.completionRate)), Math.max(baseline.length, 1));

  return works.map((work) => {
    const items = statsByWork.get(work.platformWorkId) ?? [];
    const impressions = sum(items.map((item) => item.impressions));
    const clicks = sum(items.map((item) => item.clicks));
    const readers = sum(items.map((item) => item.readers));
    const finishedReaders = finishedReadersFromStats(items);
    const groupHeat = sum(items.map((item) => item.groupHeat ?? 0));
    const comments = sum(items.map((item) => item.comments));
    const likes = sum(items.map((item) => item.likes));
    const shelves = sum(items.map((item) => item.shelves));
    const clickRate = safeRatio(clicks, impressions);
    const readCompletionRate = completionRateFromStats(items);
    const shelfRate = safeRatio(shelves, readers);
    const growthRate7d = calculateRecentGrowth(stats, work.platformWorkId, endDate);
    const promotion = markByWork.get(work.platformWorkId);
    const score = calculateScore({
      impressions,
      clickRate,
      readCompletionRate,
      growthRate7d,
      promotion,
      avgImpressions,
      avgClickRate,
      avgCompletionRate
    });

    return {
      work,
      promotion,
      impressions,
      clicks,
      readers,
      finishedReaders,
      groupHeat,
      comments,
      likes,
      shelves,
      clickRate,
      readCompletionRate,
      shelfRate,
      growthRate7d,
      score,
      scoreLabel: score >= 4 ? "优先推广" : score >= 3 ? "观察" : "普通"
    };
  });
};

const calculateRecentGrowth = (stats: WorkDailyStats[], platformWorkId: string, endDate: string) => {
  const end = dayjs(endDate);
  const currentStart = end.subtract(6, "day");
  const previousStart = currentStart.subtract(7, "day");
  const previousEnd = currentStart.subtract(1, "day");

  const scoped = stats.filter((item) => item.platformWorkId === platformWorkId);
  const current = sum(
    scoped
      .filter((item) => inRange(item.statDate, currentStart.format("YYYY-MM-DD"), end.format("YYYY-MM-DD")))
      .map((item) => item.finishedReaders ?? item.readers)
  );
  const previous = sum(
    scoped
      .filter((item) => inRange(item.statDate, previousStart.format("YYYY-MM-DD"), previousEnd.format("YYYY-MM-DD")))
      .map((item) => item.finishedReaders ?? item.readers)
  );

  if (!previous) return current ? 1 : null;
  return current / previous - 1;
};

const calculateScore = (input: {
  impressions: number;
  clickRate: number;
  readCompletionRate: number;
  growthRate7d: number | null;
  promotion?: PromotionMark;
  avgImpressions: number;
  avgClickRate: number;
  avgCompletionRate: number;
}) => {
  let score = 0;
  if (input.impressions > input.avgImpressions) score += 1;
  if (input.clickRate > input.avgClickRate) score += 1;
  if (input.readCompletionRate > input.avgCompletionRate) score += 2;
  if ((input.growthRate7d ?? 0) > 0) score += 1;
  if (!input.promotion || input.promotion.state !== "promoted") score += 1;
  return score;
};

export const formatNumber = (value: number) => new Intl.NumberFormat("zh-CN").format(Math.round(value));

export const formatPercent = (value: number, fallback = "0.00%") => {
  if (!Number.isFinite(value)) return fallback;
  return `${(value * 100).toFixed(2)}%`;
};
