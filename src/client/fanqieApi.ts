import { FANQIE_COMMON_QUERY, FANQIE_ORIGIN } from "../shared/constants";
import type { FanqieApiResult } from "../shared/types";

export type FanqieRequestOptions = {
  path: string;
  query?: Record<string, string | number | undefined>;
};

export const buildFanqieUrl = ({ path, query }: FanqieRequestOptions) => {
  const url = new URL(path, FANQIE_ORIGIN);
  const params = { ...FANQIE_COMMON_QUERY, ...query };
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
};

export const fanqieGet = async <T>(options: FanqieRequestOptions): Promise<FanqieApiResult<T>> => {
  const response = await fetch(buildFanqieUrl(options), {
    credentials: "include",
    method: "GET"
  });

  if (!response.ok) {
    return {
      code: response.status,
      message: `请求失败：${response.status}`
    };
  }

  return response.json() as Promise<FanqieApiResult<T>>;
};

export const fanqieEndpoints = {
  userInfo: "/api/user/info/v2",
  shortArticleList: "/api/author/short_article/list/v0/",
  shortStatsBookList: "/api/author/sa_stats/book_list/v0/",
  shortStatsCommon: "/api/author/sa_stats/common/v0/",
  shortStatsByDate: "/api/author/sa_stats/by_date/v0/",
  shortStatsSingleCommon: "/api/author/sa_stats/single_common/v0/",
  shortStatsSingleByDate: "/api/author/sa_stats/single_by_date/v0/"
} as const;

export const fanqieEndpointNames: Record<string, string> = {
  [fanqieEndpoints.userInfo]: "用户信息",
  [fanqieEndpoints.shortArticleList]: "短故事列表",
  [fanqieEndpoints.shortStatsBookList]: "作品统计列表",
  [fanqieEndpoints.shortStatsCommon]: "累计指标",
  [fanqieEndpoints.shortStatsByDate]: "按日期指标",
  [fanqieEndpoints.shortStatsSingleCommon]: "单作品累计指标",
  [fanqieEndpoints.shortStatsSingleByDate]: "单作品按日期指标"
};
