import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  ArrowDownUp,
  BadgeCheck,
  CalendarDays,
  Download,
  FlaskConical,
  Gauge,
  RefreshCw,
  Search,
  Star,
  TrendingUp
} from "lucide-react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable
} from "@tanstack/react-table";
import { useRef } from "react";
import { aggregateWorks, formatNumber, formatPercent, getRangeDates } from "../../domain/metrics";
import { loadDashboardData, updatePromotionMark } from "../../db";
import { RANGE_LABELS } from "../../shared/constants";
import type {
  AggregatedWork,
  SyncResult,
  SyncState,
  TimeRangePreset,
  Work,
  WorkDailyStats
} from "../../shared/types";

type DashboardData = {
  works: Work[];
  stats: WorkDailyStats[];
  rows: AggregatedWork[];
  syncState: SyncState;
};

type ProbeResult = {
  ok: boolean;
  bookId?: string;
  checkedAt?: string;
  error?: string;
  results?: Array<{
    name: string;
    status: "fulfilled" | "rejected";
    body: string;
  }>;
};

const mobileSortOptions = [
  { value: "finishedReaders:desc", label: "触底从高到低" },
  { value: "readCompletionRate:desc", label: "触底率从高到低" },
  { value: "readers:desc", label: "阅读从高到低" },
  { value: "impressions:desc", label: "展现从高到低" },
  { value: "clickRate:desc", label: "点击率从高到低" },
  { value: "growthRate7d:desc", label: "7日增长从高到低" },
  { value: "score:desc", label: "推荐分从高到低" }
] as const;

const columnHelper = createColumnHelper<AggregatedWork>();

const formatSyncStatus = (syncState?: SyncState) => {
  if (!syncState?.message) return "本地面板已就绪";
  
  let dateStr = "";
  if (syncState.lastSyncedAt) {
    const d = new Date(syncState.lastSyncedAt);
    dateStr = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }
  
  if (syncState.status === "success" && dateStr) {
    return `${syncState.message} (${dateStr})`;
  }
  return syncState.message;
};

const columns = [
  columnHelper.accessor((row) => row.work.title, {
    id: "title",
    header: "作品",
    cell: ({ row }) => (
      <div className="work-title-cell">
        <span className="work-title">{row.original.work.title}</span>
        <span className="work-meta">
          {row.original.work.signStatus ?? "未标记"} · {row.original.work.status === "finished" ? "完结" : "连载"}
        </span>
      </div>
    )
  }),
  columnHelper.accessor("impressions", {
    header: "展现",
    cell: (info) => formatNumber(info.getValue())
  }),
  columnHelper.accessor("readers", {
    header: "阅读",
    cell: (info) => formatNumber(info.getValue())
  }),
  columnHelper.accessor("clickRate", {
    header: "点击率",
    cell: (info) => formatPercent(info.getValue())
  }),
  columnHelper.accessor("finishedReaders", {
    header: "触底估算",
    cell: (info) => formatNumber(info.getValue())
  }),
  columnHelper.accessor("readCompletionRate", {
    header: "触底率",
    cell: (info) => formatPercent(info.getValue())
  }),
  columnHelper.accessor("growthRate7d", {
    header: "7日增长",
    cell: (info) => {
      const value = info.getValue();
      if (value === null) return "暂无";
      return <span className={value >= 0 ? "trend-up" : "trend-down"}>{formatPercent(value)}</span>;
    }
  }),
  columnHelper.accessor("score", {
    header: "推荐",
    cell: ({ row }) => <ScoreBadge row={row.original} />
  })
];

export function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [range, setRange] = useState<Exclude<TimeRangePreset, "custom">>("14d");
  const [query, setQuery] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "finishedReaders", desc: true }]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);

  const rangeDates = useMemo(() => getRangeDates(range), [range]);

  const refresh = async () => {
    setLoading(true);
    const loaded = await loadDashboardData();
    const rows = aggregateWorks(loaded.works, loaded.stats, loaded.marks, rangeDates.start, rangeDates.end);
    setData({ ...loaded, rows, syncState: loaded.syncState });
    setSelectedId((current) =>
      current && rows.some((row) => row.work.platformWorkId === current)
        ? current
        : rows[0]?.work.platformWorkId ?? null
    );
    setLoading(false);
  };

  const syncAndRefresh = async () => {
    setLoading(true);
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
        await chrome.runtime.sendMessage({ type: "fanqie:sync" }) as SyncResult;
      }

      const loaded = await loadDashboardData();
      const rows = aggregateWorks(loaded.works, loaded.stats, loaded.marks, rangeDates.start, rangeDates.end);
      setData({ ...loaded, rows, syncState: loaded.syncState });
      setSelectedId(rows[0]?.work.platformWorkId ?? null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [rangeDates.start, rangeDates.end]);

  useEffect(() => {
    if (!loading) return;

    const timer = globalThis.setInterval(async () => {
      const loaded = await loadDashboardData();
      const rows = aggregateWorks(loaded.works, loaded.stats, loaded.marks, rangeDates.start, rangeDates.end);
      setData({ ...loaded, rows, syncState: loaded.syncState });
    }, 600);

    return () => globalThis.clearInterval(timer);
  }, [loading, rangeDates.start, rangeDates.end]);

  const filteredRows = useMemo(() => {
    const rows = data?.rows ?? [];
    if (!query.trim()) return rows;
    return rows.filter((row) => row.work.title.includes(query.trim()));
  }, [data?.rows, query]);

  useEffect(() => {
    if (!filteredRows.length) {
      setSelectedId(null);
      return;
    }

    setSelectedId((current) =>
      current && filteredRows.some((row) => row.work.platformWorkId === current)
        ? current
        : filteredRows[0].work.platformWorkId
    );
  }, [filteredRows]);

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: {
      sorting
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel()
  });

  const selected = useMemo(
    () => filteredRows.find((row) => row.work.platformWorkId === selectedId) ?? filteredRows[0],
    [filteredRows, selectedId]
  );

  const totals = useMemo(() => {
    const rows = filteredRows;
    return {
      works: rows.length,
      readers: rows.reduce((total, row) => total + row.readers, 0),
      finishedReaders: rows.reduce((total, row) => total + row.finishedReaders, 0),
      avgCompletion:
        rows.reduce((total, row) => total + row.readCompletionRate, 0) / Math.max(rows.length, 1),
      candidates: rows.filter((row) => row.scoreLabel === "优先推广").length
    };
  }, [filteredRows]);

  const handleExport = () => {
    const rows = table.getSortedRowModel().rows.map((row) => row.original);
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `番茄短故事数据-${rangeDates.start}-${rangeDates.end}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleRangeChange = (nextRange: Exclude<TimeRangePreset, "custom">) => {
    if (nextRange === range) return;
    setSelectedId(null);
    setRange(nextRange);
  };

  const currentMobileSort = `${sorting[0]?.id ?? "finishedReaders"}:${sorting[0]?.desc === false ? "asc" : "desc"}`;

  const handleMobileSortChange = (value: string) => {
    const [id, direction] = value.split(":");
    setSorting([{ id, desc: direction !== "asc" }]);
  };

  const handleProbeApis = async () => {
    setProbeLoading(true);
    setProbeResult(null);

    try {
      if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
        setProbeResult({ ok: false, error: "当前不是扩展页面，请在 Chrome 插件面板中执行验证。" });
        return;
      }

      const result = (await chrome.runtime.sendMessage({
        type: "fanqie:probe-apis",
        bookId: selected?.work.platformWorkId ?? "7636231301661477950"
      })) as ProbeResult;
      setProbeResult(result);
    } catch (error) {
      setProbeResult({ ok: false, error: String(error) });
    } finally {
      setProbeLoading(false);
    }
  };

  const markPromoted = async (row: AggregatedWork) => {
    await updatePromotionMark({
      platformWorkId: row.work.platformWorkId,
      state: row.promotion?.state === "promoted" ? "unpromoted" : "promoted",
      promotedAt: row.promotion?.state === "promoted" ? undefined : dayjs().format("YYYY-MM-DD"),
      channel: row.promotion?.state === "promoted" ? undefined : "微头条",
      note: row.promotion?.note,
      updatedAt: new Date().toISOString()
    });
    await refresh();
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <p className="eyebrow">Fanqie Short Story Ops</p>
          <h1>番茄短故事数据面板</h1>
        </div>
        <div className="topbar-actions">
          <span className="sync-status">{formatSyncStatus(data?.syncState)}</span>
          <button className="icon-button" onClick={handleProbeApis} disabled={probeLoading} title="验证接口" type="button">
            <FlaskConical size={16} />
          </button>
          <button className="command-button" onClick={syncAndRefresh} disabled={loading} type="button">
            <RefreshCw size={16} />
            {loading ? "同步中..." : "同步数据"}
          </button>
        </div>
      </header>

      <section className="metric-strip">
        <MetricCard icon={<Gauge size={18} />} label="作品数" value={formatNumber(totals.works)} />
        <MetricCard icon={<TrendingUp size={18} />} label="阅读人数" value={formatNumber(totals.readers)} />
        <MetricCard icon={<BadgeCheck size={18} />} label="触底估算" value={formatNumber(totals.finishedReaders)} />
        <MetricCard icon={<Star size={18} />} label="优先推广" value={formatNumber(totals.candidates)} />
        <MetricCard icon={<CalendarDays size={18} />} label="平均触底率" value={formatPercent(totals.avgCompletion)} />
      </section>

      {probeResult && (
        <section className="probe-panel">
          <div className="probe-head">
            <strong>{probeResult.ok ? "接口验证结果" : "接口验证失败"}</strong>
            {probeResult.checkedAt && <span>{dayjs(probeResult.checkedAt).format("YYYY-MM-DD HH:mm:ss")}</span>}
          </div>
          {probeResult.error && <pre>{probeResult.error}</pre>}
          {probeResult.results?.map((item) => (
            <details key={item.name} open={item.status === "rejected"}>
              <summary>
                <span>{item.name}</span>
                <em className={item.status === "fulfilled" ? "probe-ok" : "probe-error"}>{item.status}</em>
              </summary>
              <pre>{item.body}</pre>
            </details>
          ))}
        </section>
      )}

      <section className="workspace">
        <div className="main-panel">
          <div className="toolbar">
            <div className="segmented" aria-label="时间范围">
              {(["yesterday", "7d", "14d", "30d"] as const).map((item) => (
                <button
                  key={item}
                  className={range === item ? "active" : ""}
                  onClick={() => handleRangeChange(item)}
                  type="button"
                >
                  {RANGE_LABELS[item]}
                </button>
              ))}
            </div>
            <span className="range-summary">
              {rangeDates.start} 至 {rangeDates.end}
            </span>

            <label className="search-box">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索作品名"
              />
            </label>

            <button className="command-button" onClick={handleExport} type="button">
              <Download size={16} />
              导出 CSV
            </button>
          </div>

          <div className="table-wrap">
            <table className="desktop-only">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th key={header.id}>
                        <button
                          className="th-button"
                          onClick={header.column.getToggleSortingHandler()}
                          type="button"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <ArrowDownUp size={13} />
                        </button>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={selectedId === row.original.work.platformWorkId ? "selected" : ""}
                    onClick={() => setSelectedId(row.original.work.platformWorkId)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="card-list mobile-only">
              <label className="mobile-sort">
                <span>排序</span>
                <select value={currentMobileSort} onChange={(event) => handleMobileSortChange(event.target.value)}>
                  {mobileSortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {table.getRowModel().rows.map((row) => (
                <div
                  key={row.id}
                  className={`work-card ${selectedId === row.original.work.platformWorkId ? "selected" : ""}`}
                  onClick={() => setSelectedId(row.original.work.platformWorkId)}
                >
                  <div className="work-card-header">
                    <span className="work-card-title">{row.original.work.title}</span>
                    <ScoreBadge row={row.original} />
                  </div>
                  <div className="work-card-meta">
                    {row.original.work.signStatus ?? "未标记"} · {row.original.work.status === "finished" ? "完结" : "连载"}
                  </div>
                  <div className="work-card-stats">
                    <div className="stat-item">
                      <span className="stat-label">展现</span>
                      <span className="stat-value">{formatNumber(row.original.impressions)}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">阅读</span>
                      <span className="stat-value">{formatNumber(row.original.readers)}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">点击率</span>
                      <span className="stat-value">{formatPercent(row.original.clickRate)}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">触底</span>
                      <span className="stat-value">{formatNumber(row.original.finishedReaders)}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">触底率</span>
                      <span className="stat-value">{formatPercent(row.original.readCompletionRate)}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">7日增长</span>
                      <span className={`stat-value ${row.original.growthRate7d !== null ? (row.original.growthRate7d >= 0 ? "trend-up" : "trend-down") : ""}`}>
                        {row.original.growthRate7d === null ? "暂无" : formatPercent(row.original.growthRate7d)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {!table.getRowModel().rows.length && <div className="empty-state">没有匹配的作品</div>}
          </div>
        </div>

        <aside className="side-panel">
          <section className="recommendation">
            <h2>推广池</h2>
            <div className="candidate-list">
              {filteredRows
                .filter((row) => row.scoreLabel !== "普通")
                .slice(0, 5)
                .map((row) => (
                  <button
                    key={row.work.platformWorkId}
                    className="candidate"
                    onClick={() => setSelectedId(row.work.platformWorkId)}
                    type="button"
                  >
                    <span>{row.work.title}</span>
                    <strong>{row.scoreLabel}</strong>
                  </button>
                ))}
            </div>
          </section>

          {selected && (
            <section className="detail">
              <div className="detail-head">
                <div>
                  <h2>{selected.work.title}</h2>
                  <p>
                    {selected.work.signStatus ?? "未标记"} · {selected.work.publishTime ?? "发布时间未知"}
                  </p>
                </div>
                <button className="command-button compact" onClick={() => markPromoted(selected)} type="button">
                  {selected.promotion?.state === "promoted" ? "取消标记" : "标记已推"}
                </button>
              </div>
              <TrendChart stats={data?.stats ?? []} workId={selected.work.platformWorkId} />
              <dl className="detail-grid">
                <div>
                  <dt>点击率</dt>
                  <dd>{formatPercent(selected.clickRate)}</dd>
                </div>
                <div>
                  <dt>触底率</dt>
                  <dd>{formatPercent(selected.readCompletionRate)}</dd>
                </div>
                <div>
                  <dt>书架率</dt>
                  <dd>{formatPercent(selected.shelfRate)}</dd>
                </div>
                <div>
                  <dt>推广状态</dt>
                  <dd>{selected.promotion?.state === "promoted" ? "已推广" : "未推广"}</dd>
                </div>
              </dl>
            </section>
          )}
        </aside>
      </section>
    </main>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <article className="metric-card">
      <span className="metric-icon">{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function ScoreBadge({ row }: { row: AggregatedWork }) {
  return <span className={`score-badge score-${row.scoreLabel}`}>{row.scoreLabel}</span>;
}

function TrendChart({ stats, workId }: { stats: WorkDailyStats[]; workId: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const items = stats
    .filter((item) => item.platformWorkId === workId)
    .slice(-14)
    .sort((a, b) => a.statDate.localeCompare(b.statDate));

  const width = 320;
  const height = 180;
  const padding = 22;
  const max = Math.max(...items.flatMap((item) => [item.readers, item.finishedReaders ?? 0]), 1);
  const makePoints = (values: number[]) =>
    values
      .map((value, index) => {
        const x = padding + (index / Math.max(values.length - 1, 1)) * (width - padding * 2);
        const y = height - padding - (value / max) * (height - padding * 2);
        return `${x},${y}`;
      })
      .join(" ");

  const readerPoints = makePoints(items.map((item) => item.readers));
  const finishPoints = makePoints(items.map((item) => item.finishedReaders ?? 0));

  return (
    <div className="trend-chart" ref={ref}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="近 14 日阅读和触底趋势">
        <line className="chart-grid" x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
        <line className="chart-grid" x1={padding} y1={padding} x2={padding} y2={height - padding} />
        <polyline className="chart-area" points={`${padding},${height - padding} ${readerPoints} ${width - padding},${height - padding}`} />
        <polyline className="chart-line chart-line-readers" points={readerPoints} />
        <polyline className="chart-line chart-line-finished" points={finishPoints} />
        {items.map((item, index) => {
          if (index % 4 !== 0 && index !== items.length - 1) return null;
          const x = padding + (index / Math.max(items.length - 1, 1)) * (width - padding * 2);
          return (
            <text className="chart-label" key={item.statDate} x={x} y={height - 4} textAnchor="middle">
              {item.statDate.slice(5)}
            </text>
          );
        })}
      </svg>
      <div className="chart-legend">
        <span><i className="legend-readers" />阅读</span>
        <span><i className="legend-finished" />触底</span>
      </div>
    </div>
  );
}

function toCsv(rows: AggregatedWork[]) {
  const header = ["作品", "展现", "点击", "阅读", "点击率", "触底估算", "触底率", "7日增长", "推荐"];
  const body = rows.map((row) => [
    row.work.title,
    row.impressions,
    row.clicks,
    row.readers,
    formatPercent(row.clickRate),
    row.finishedReaders,
    formatPercent(row.readCompletionRate),
    row.growthRate7d === null ? "" : formatPercent(row.growthRate7d),
    row.scoreLabel
  ]);

  return [header, ...body]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
}
