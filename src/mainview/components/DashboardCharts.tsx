import type { ReactNode } from "react";
import { SESSION_SOURCES, type SessionSource } from "@shared/schema";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate, formatNumber, formatTokens, formatUsd } from "../lib/formatters";
import { SOURCE_COLORS, SOURCE_LABELS } from "../lib/constants";
import type {
  AgentBreakdown,
  DailyAgentTokensByDate,
  ModelBreakdown,
  TimelinePoint,
} from "../hooks/useDashboardData";

interface DashboardChartsProps {
  dateFrom: string;
  dateTo: string;
  modelBreakdown: ModelBreakdown[];
  agentBreakdown: AgentBreakdown[];
  timeline: TimelinePoint[];
  dailyAgentTokensByDate: DailyAgentTokensByDate;
  topRepos: Array<{ repo: string; sessions: number; costUsd: number }>;
  totalCostUsd: number;
  dailyAverageCostUsd: number;
  mostExpensiveDay: TimelinePoint | null;
}

interface HeatmapCell {
  date: string;
  sessions: number;
  tokens: number;
  costUsd: number;
  intensity: number;
}

type HeatmapWeek = Array<HeatmapCell | null>;

const MODEL_COLORS = ["#22d3ee", "#3b82f6", "#14b8a6", "#0ea5e9", "#06b6d4", "#38bdf8", "#34d399", "#67e8f9"];

const AgentIconSvg = ({ d }: { d: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" className="inline-block align-[-0.125em]">
    <path fill="currentColor" d={d} />
  </svg>
);

const AGENT_ICONS: Record<string, ReactNode> = {
  claude: <AgentIconSvg d="m4.714 15.956l4.718-2.648l.079-.23l-.08-.128h-.23l-.79-.048l-2.695-.073l-2.337-.097l-2.265-.122l-.57-.121l-.535-.704l.055-.353l.48-.321l.685.06l1.518.104l2.277.157l1.651.098l2.447.255h.389l.054-.158l-.133-.097l-.103-.098l-2.356-1.596l-2.55-1.688l-1.336-.972l-.722-.491L2 6.223l-.158-1.008l.656-.722l.88.06l.224.061l.893.686l1.906 1.476l2.49 1.833l.364.304l.146-.104l.018-.072l-.164-.274l-1.354-2.446l-1.445-2.49l-.644-1.032l-.17-.619a3 3 0 0 1-.103-.729L6.287.133L6.7 0l.995.134l.42.364l.619 1.415L9.735 4.14l1.555 3.03l.455.898l.243.832l.09.255h.159V9.01l.127-1.706l.237-2.095l.23-2.695l.08-.76l.376-.91l.747-.492l.583.28l.48.685l-.067.444l-.286 1.851l-.558 2.903l-.365 1.942h.213l.243-.242l.983-1.306l1.652-2.064l.728-.82l.85-.904l.547-.431h1.032l.759 1.129l-.34 1.166l-1.063 1.347l-.88 1.142l-1.263 1.7l-.79 1.36l.074.11l.188-.02l2.853-.606l1.542-.28l1.84-.315l.832.388l.09.395l-.327.807l-1.967.486l-2.307.462l-3.436.813l-.043.03l.049.061l1.548.146l.662.036h1.62l3.018.225l.79.522l.473.638l-.08.485l-1.213.62l-1.64-.389l-3.825-.91l-1.31-.329h-.183v.11l1.093 1.068l2.003 1.81l2.508 2.33l.127.578l-.321.455l-.34-.049l-2.204-1.657l-.85-.747l-1.925-1.62h-.127v.17l.443.649l2.343 3.521l.122 1.08l-.17.353l-.607.213l-.668-.122l-1.372-1.924l-1.415-2.168l-1.141-1.943l-.14.08l-.674 7.254l-.316.37l-.728.28l-.607-.461l-.322-.747l.322-1.476l.388-1.924l.316-1.53l.285-1.9l.17-.632l-.012-.042l-.14.018l-1.432 1.967l-2.18 2.945l-1.724 1.845l-.413.164l-.716-.37l.066-.662l.401-.589l2.386-3.036l1.439-1.882l.929-1.086l-.006-.158h-.055L4.138 18.56l-1.13.146l-.485-.456l.06-.746l.231-.243l1.907-1.312Z" />,
  codex: <AgentIconSvg d="M20.562 10.188c.25-.688.313-1.376.25-2.063c-.062-.687-.312-1.375-.625-2c-.562-.937-1.375-1.687-2.312-2.125c-1-.437-2.063-.562-3.125-.312c-.5-.5-1.063-.938-1.688-1.25S11.687 2 11 2a5.17 5.17 0 0 0-3 .938c-.875.624-1.5 1.5-1.813 2.5c-.75.187-1.375.5-2 .875c-.562.437-1 1-1.375 1.562c-.562.938-.75 2-.625 3.063a5.44 5.44 0 0 0 1.25 2.874a4.7 4.7 0 0 0-.25 2.063c.063.688.313 1.375.625 2c.563.938 1.375 1.688 2.313 2.125c1 .438 2.062.563 3.125.313c.5.5 1.062.937 1.687 1.25S12.312 22 13 22a5.17 5.17 0 0 0 3-.937c.875-.625 1.5-1.5 1.812-2.5a4.54 4.54 0 0 0 1.938-.875c.562-.438 1.062-.938 1.375-1.563c.562-.937.75-2 .625-3.062c-.125-1.063-.5-2.063-1.188-2.876m-7.5 10.5c-1 0-1.75-.313-2.437-.875c0 0 .062-.063.125-.063l4-2.312a.5.5 0 0 0 .25-.25a.57.57 0 0 0 .062-.313V11.25l1.688 1v4.625a3.685 3.685 0 0 1-3.688 3.813M5 17.25c-.438-.75-.625-1.625-.438-2.5c0 0 .063.063.125.063l4 2.312a.56.56 0 0 0 .313.063c.125 0 .25 0 .312-.063l4.875-2.812v1.937l-4.062 2.375A3.7 3.7 0 0 1 7.312 19c-1-.25-1.812-.875-2.312-1.75M3.937 8.563a3.8 3.8 0 0 1 1.938-1.626v4.751c0 .124 0 .25.062.312a.5.5 0 0 0 .25.25l4.875 2.813l-1.687 1l-4-2.313a3.7 3.7 0 0 1-1.75-2.25c-.25-.937-.188-2.062.312-2.937M17.75 11.75l-4.875-2.812l1.687-1l4 2.312c.625.375 1.125.875 1.438 1.5s.5 1.313.437 2.063a3.7 3.7 0 0 1-.75 1.937c-.437.563-1 1-1.687 1.25v-4.75c0-.125 0-.25-.063-.312c0 0-.062-.126-.187-.188m1.687-2.5s-.062-.062-.125-.062l-4-2.313c-.125-.062-.187-.062-.312-.062s-.25 0-.313.062L9.812 9.688V7.75l4.063-2.375c.625-.375 1.312-.5 2.062-.5c.688 0 1.375.25 2 .688c.563.437 1.063 1 1.313 1.625s.312 1.375.187 2.062m-10.5 3.5l-1.687-1V7.063c0-.688.187-1.438.562-2C8.187 4.438 8.75 4 9.375 3.688a3.37 3.37 0 0 1 2.062-.313c.688.063 1.375.375 1.938.813c0 0-.063.062-.125.062l-4 2.313a.5.5 0 0 0-.25.25c-.063.125-.063.187-.063.312zm.875-2L12 9.5l2.187 1.25v2.5L12 14.5l-2.188-1.25z" />,
  gemini: <AgentIconSvg d="M24 12.024c-6.437.388-11.59 5.539-11.977 11.976h-.047C11.588 17.563 6.436 12.412 0 12.024v-.047C6.437 11.588 11.588 6.437 11.976 0h.047c.388 6.437 5.54 11.588 11.977 11.977z" />,
  opencode: "💻",
  droid: "🤖",
  copilot: "🛸",
};

const formatShortDate = (value: string): string => {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(parsed));
};

const buildHeatmap = (timeline: TimelinePoint[], dateFrom: string, dateTo: string): HeatmapCell[] => {
  const byDate = new Map<string, TimelinePoint>();
  for (const point of timeline) byDate.set(point.date, point);

  const start = new Date(`${dateFrom}T00:00:00Z`);
  const end = new Date(`${dateTo}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];

  const maxTokens = timeline.reduce((max, point) => Math.max(max, point.tokens), 0);
  const cells: HeatmapCell[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    const point = byDate.get(iso);
    const tokens = point?.tokens ?? 0;
    cells.push({
      date: iso,
      sessions: point?.sessions ?? 0,
      tokens,
      costUsd: point?.costUsd ?? 0,
      intensity: maxTokens > 0 ? tokens / maxTokens : 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return cells;
};

const buildHeatmapWeeks = (cells: HeatmapCell[]): HeatmapWeek[] => {
  const weeks: HeatmapWeek[] = [];

  for (const cell of cells) {
    const parsed = Date.parse(`${cell.date}T00:00:00Z`);
    if (Number.isNaN(parsed)) continue;
    const dayIndex = new Date(parsed).getUTCDay();

    if (weeks.length === 0 || dayIndex === 0) {
      weeks.push(Array<HeatmapCell | null>(7).fill(null));
    }

    weeks[weeks.length - 1][dayIndex] = cell;
  }

  return weeks;
};

const chartWrapperClass = "h-56 w-full sm:h-64";

const formatTokensTooltipWithValue = (value: number | string | undefined) => {
  const numericValue = typeof value === "number" ? value : Number(value ?? 0);
  return [`${formatTokens(numericValue)} (${formatNumber(numericValue)})`, "Tokens"];
};

const formatUsdTooltip = (value: number | string | undefined) =>
  formatUsd(typeof value === "number" ? value : Number(value ?? 0));

const formatNumberTooltip = (value: number | string | undefined) =>
  formatNumber(typeof value === "number" ? value : Number(value ?? 0));

const buildActivityTooltip = (cell: HeatmapCell, dailyAgentTokensByDate: DailyAgentTokensByDate): string => {
  const agentTotals = dailyAgentTokensByDate[cell.date];

  const lines = SESSION_SOURCES
    .map((source) => ({
      source,
      tokens: agentTotals?.[source] ?? 0,
    }))
    .filter((entry) => entry.tokens > 0)
    .sort((left, right) => right.tokens - left.tokens)
    .map(
      (entry) =>
        `- ${SOURCE_LABELS[entry.source as SessionSource]} - ${formatTokens(entry.tokens)}`,
    );

  if (lines.length === 0) {
    lines.push(`- All agents - ${formatTokens(cell.tokens)}`);
  }

  return `${formatDate(cell.date)}\n${lines.join("\n")}`;
};

const DashboardCharts = ({
  dateFrom,
  dateTo,
  modelBreakdown,
  agentBreakdown,
  timeline,
  dailyAgentTokensByDate,
  topRepos,
  totalCostUsd,
  dailyAverageCostUsd,
  mostExpensiveDay,
}: DashboardChartsProps) => {
  const totalModelTokens = modelBreakdown.reduce((sum, row) => sum + row.tokens, 0);
  const modelRows = modelBreakdown.map((row, index) => ({
    ...row,
    color: MODEL_COLORS[index % MODEL_COLORS.length],
    percentage: totalModelTokens > 0 ? (row.tokens / totalModelTokens) * 100 : 0,
  }));
  const chartModelRows = modelRows.slice(0, 8);

  const totalAgentTokens = agentBreakdown.reduce((sum, row) => sum + row.tokens, 0);
  const agentRows = (() => {
    const mapped = agentBreakdown.map((row) => ({
      source: row.source,
      label: row.label,
      sessions: row.sessions,
      tokens: row.tokens,
      costUsd: row.costUsd,
      color: SOURCE_COLORS[row.source] ?? "#94a3b8",
      percentage: totalAgentTokens > 0 ? (row.tokens / totalAgentTokens) * 100 : 0,
      icon: AGENT_ICONS[row.source] ?? ("🤝" as ReactNode),
    }));
    const major = mapped.filter((r) => r.percentage >= 1);
    const minor = mapped.filter((r) => r.percentage < 1 && r.percentage > 0);
    if (minor.length === 0) return major;
    const otherTokens = minor.reduce((s, r) => s + r.tokens, 0);
    const otherSessions = minor.reduce((s, r) => s + r.sessions, 0);
    const otherCost = minor.reduce((s, r) => s + r.costUsd, 0);
    return [
      ...major,
      {
        source: "other" as AgentBreakdown["source"],
        label: "Others",
        sessions: otherSessions,
        tokens: otherTokens,
        costUsd: otherCost,
        color: "#94a3b8",
        percentage: totalAgentTokens > 0 ? (otherTokens / totalAgentTokens) * 100 : 0,
        icon: "🤝" as ReactNode,
      },
    ];
  })();

  const heatmap = buildHeatmap(timeline, dateFrom, dateTo);
  const heatmapWeeks = buildHeatmapWeeks(heatmap);

  return (
    <>
      <section className="wrapped-card wrapped-card-models">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="wrapped-kicker">Card 3</p>
            <h2 className="wrapped-title">Your Top Models</h2>
          </div>
          <p className="text-sm text-slate-300">Ranked by token usage</p>
        </header>

        {modelRows.length === 0 ? (
          <p className="text-sm text-slate-300">No model activity found in this range.</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className={chartWrapperClass}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartModelRows} layout="vertical" margin={{ left: 18, right: 16 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.22)" strokeDasharray="2 5" />
                  <XAxis type="number" tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis
                    dataKey="model"
                    type="category"
                    tick={{ fill: "#e2e8f0", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={188}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(59,130,246,0.15)" }}
                    contentStyle={{
                      background: "rgba(2,6,23,0.95)",
                      border: "1px solid rgba(148,163,184,0.35)",
                      borderRadius: "12px",
                    }}
                    formatter={formatTokensTooltipWithValue}
                  />
                  <Bar dataKey="tokens" name="Tokens" radius={[0, 10, 10, 0]}>
                    {chartModelRows.map((row) => (
                      <Cell key={row.model} fill={row.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
              {modelRows.map((row) => (
                <article
                  key={row.model}
                  className="wrapped-tile"
                  title={`${row.model}: ${formatNumber(row.tokens)} tokens (${row.percentage.toFixed(1)}%)`}
                >
                  <div className="flex items-center justify-between text-sm text-slate-200">
                    <span className="truncate pr-3">{row.model}</span>
                    <span>{row.percentage.toFixed(1)}%</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-700/45">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${row.percentage}%`, backgroundColor: row.color }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-300">{formatTokens(row.tokens)} ({formatNumber(row.tokens)})</p>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="wrapped-card wrapped-card-agents">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="wrapped-kicker">Card 4</p>
            <h2 className="wrapped-title">Your Agents</h2>
          </div>
          <p className="text-sm text-slate-300">Token distribution by agent</p>
        </header>

        {agentRows.length === 0 ? (
          <p className="text-sm text-slate-300">No agent data found for this period.</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <div className={chartWrapperClass}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={agentRows}
                    dataKey="tokens"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={105}
                    paddingAngle={agentRows.length > 1 ? 3 : 0}
                  >
                    {agentRows.map((row) => (
                      <Cell key={row.source} fill={row.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "rgba(2,6,23,0.95)",
                      border: "1px solid rgba(148,163,184,0.35)",
                      borderRadius: "12px",
                    }}
                    formatter={formatTokensTooltipWithValue}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {agentRows.map((row) => (
                <article key={row.source} className="wrapped-tile">
                  <p className="text-xs uppercase tracking-[0.2em]" style={{ color: row.color }}>{row.icon} {row.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{formatTokens(row.tokens)}</p>
                  <p className="mt-1 text-xs text-slate-300">{row.percentage.toFixed(1)}% of total</p>
                  <p className="text-xs text-slate-400">{formatNumber(row.sessions)} sessions</p>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="wrapped-card wrapped-card-activity">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="wrapped-kicker">Card 5</p>
            <h2 className="wrapped-title">Daily Activity</h2>
          </div>
          <p className="text-sm text-slate-300">Heatmap of daily token usage</p>
        </header>

        {heatmap.length === 0 ? (
          <p className="text-sm text-slate-300">No activity timeline available.</p>
        ) : (
          <div>
            <div className="rounded-2xl border border-white/12 bg-slate-950/45 p-4">
              <div
                className="grid gap-1"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(heatmapWeeks.length, 1)}, minmax(0, 1fr))`,
                }}
              >
                {heatmapWeeks.map((week, weekIndex) => (
                  <div key={`week-${weekIndex}`} className="grid grid-rows-7 gap-1">
                    {week.map((cell, dayIndex) => {
                      if (!cell) {
                        return <div key={`empty-${weekIndex}-${dayIndex}`} className="aspect-square w-full rounded-[4px] opacity-0" />;
                      }

                      const alpha = 0.12 + cell.intensity * 0.88;
                      const background =
                        cell.sessions > 0 ? `rgba(45,212,191,${alpha.toFixed(3)})` : "rgba(71,85,105,0.20)";

                      return (
                        <div
                          key={cell.date}
                          className="aspect-square w-full rounded-[4px]"
                          style={{ background }}
                          title={buildActivityTooltip(cell, dailyAgentTokensByDate)}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">{formatShortDate(dateFrom)} - {formatShortDate(dateTo)}</p>
          </div>
        )}
      </section>

      <section className="wrapped-card wrapped-card-cost">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="wrapped-kicker">Card 6</p>
            <h2 className="wrapped-title">Cost Breakdown</h2>
          </div>
          <p className="text-sm text-slate-300">Spend trend across the year</p>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <article className="wrapped-tile">
            <p className="wrapped-label">Total Spend</p>
            <p className="mt-2 text-4xl font-semibold text-white">{formatUsd(totalCostUsd)}</p>
          </article>
          <article className="wrapped-tile">
            <p className="wrapped-label">Daily Average</p>
            <p className="mt-2 text-3xl font-semibold text-white">{formatUsd(dailyAverageCostUsd)}</p>
          </article>
          <article className="wrapped-tile">
            <p className="wrapped-label">Most Expensive Day</p>
            <p className="mt-2 text-xl font-semibold text-white">
              {mostExpensiveDay ? formatShortDate(mostExpensiveDay.date) : "-"}
            </p>
            <p className="mt-1 text-sm text-slate-300">
              {mostExpensiveDay ? formatUsd(mostExpensiveDay.costUsd) : "No cost data"}
            </p>
          </article>
        </div>

        <div className="mt-6 h-56 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeline}>
              <defs>
                <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.08} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(148,163,184,0.2)" strokeDasharray="2 5" />
              <XAxis dataKey="date" tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: "rgba(2,6,23,0.95)",
                  border: "1px solid rgba(148,163,184,0.35)",
                  borderRadius: "12px",
                }}
                formatter={formatUsdTooltip}
                labelFormatter={(value) => formatDate(String(value))}
              />
              <Area type="monotone" dataKey="costUsd" stroke="#38bdf8" fill="url(#costFill)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="wrapped-card wrapped-card-repos">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="wrapped-kicker">Card 7</p>
            <h2 className="wrapped-title">Your Top Repos</h2>
          </div>
          <p className="text-sm text-slate-300">By session volume and cost</p>
        </header>

        {topRepos.length === 0 ? (
          <p className="text-sm text-slate-300">No repository usage found.</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <div className="space-y-2">
              {topRepos.map((repo) => (
                <article key={repo.repo} className="wrapped-tile">
                  <p className="truncate text-sm font-semibold text-white">{repo.repo}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-300">
                    <span>{formatNumber(repo.sessions)} sessions</span>
                    <span>{formatUsd(repo.costUsd)}</span>
                  </div>
                </article>
              ))}
            </div>

            <div className={chartWrapperClass}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topRepos} layout="vertical" margin={{ left: 12, right: 16 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.2)" strokeDasharray="2 5" />
                  <XAxis type="number" tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis
                    dataKey="repo"
                    type="category"
                    tick={{ fill: "#e2e8f0", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={140}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(2,6,23,0.95)",
                      border: "1px solid rgba(148,163,184,0.35)",
                      borderRadius: "12px",
                    }}
                    formatter={formatNumberTooltip}
                  />
                  <Bar dataKey="sessions" fill="#14b8a6" radius={[0, 10, 10, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>
    </>
  );
};

export default DashboardCharts;
