import dayjs from "dayjs";
import type { PromotionMark, Work, WorkDailyStats } from "../shared/types";

const titles = [
  "我去银行解冻亡父遗产那天柜员说我三年前就把钱取走了",
  "丈夫把我推进海里后，我在他的婚礼上醒来",
  "妹妹顶替我嫁进豪门后，婆婆开始找真正的救命恩人",
  "我死后第五年，前夫终于看见了那封举报信",
  "全家逼我给弟弟买房，我反手公开了亲子鉴定",
  "老板让我背锅的那晚，我把监控发给了所有股东",
  "闺蜜偷走我的高考志愿后，她的人生开始失控",
  "我妈把拆迁款给舅舅后，舅舅一家住进了我家"
];

export const createMockDataset = () => {
  const now = dayjs();
  const works: Work[] = titles.map((title, index) => ({
    platformWorkId: String(7636231301661477950n + BigInt(index * 37987)),
    itemId: String(900000 + index),
    title,
    status: index % 3 === 0 ? "finished" : "publishing",
    signStatus: index % 2 === 0 ? "已签约" : "待观察",
    publishTime: now.subtract(index * 4 + 9, "day").format("YYYY-MM-DD"),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  }));

  const stats: WorkDailyStats[] = [];
  for (const [workIndex, work] of works.entries()) {
    for (let day = 35; day >= 0; day -= 1) {
      const statDate = now.subtract(day, "day").format("YYYY-MM-DD");
      const heat = 1 + workIndex * 0.22;
      const wave = 1 + Math.sin((36 - day + workIndex) / 3) * 0.22;
      const lift = workIndex === 0 && day < 8 ? 1.8 : workIndex === 3 && day < 12 ? 1.45 : 1;
      const impressions = Math.round((650 + workIndex * 290) * heat * wave * lift);
      const clickRate = 0.18 + (workIndex % 4) * 0.025;
      const readers = Math.round(impressions * clickRate * (0.82 + (workIndex % 3) * 0.05));
      const clicks = Math.round(impressions * clickRate);
      const finishedReaders = Math.round(readers * (0.42 + (workIndex % 5) * 0.055));

      stats.push({
        platformWorkId: work.platformWorkId,
        statDate,
        impressions,
        clicks,
        readers,
        retention15s: Math.round(readers * 0.72),
        retention30s: Math.round(readers * 0.61),
        retention60s: Math.round(readers * 0.52),
        finishedReaders,
        groupHeat: Math.max(1, Math.round(finishedReaders / 180)),
        comments: Math.round(readers * (0.002 + workIndex * 0.0005)),
        likes: Math.round(readers * (0.011 + workIndex * 0.001)),
        shelves: Math.round(readers * (0.006 + workIndex * 0.0008)),
        internalTraffic: Math.round(readers * 0.78),
        externalTraffic: Math.round(readers * 0.22),
        raw: { source: "mock" }
      });
    }
  }

  const marks: PromotionMark[] = [
    {
      platformWorkId: works[1].platformWorkId,
      state: "promoted",
      promotedAt: now.subtract(3, "day").format("YYYY-MM-DD"),
      channel: "微头条",
      note: "已发首轮引流，观察二投窗口。",
      updatedAt: now.toISOString()
    },
    {
      platformWorkId: works[3].platformWorkId,
      state: "watch",
      note: "读完率高，等 30 天数据稳定。",
      updatedAt: now.toISOString()
    }
  ];

  return { works, stats, marks };
};
