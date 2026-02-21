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
import type { AgentBreakdown, ModelBreakdown, TimelinePoint } from "../hooks/useDashboardData";

interface DashboardChartsProps {
  dateFrom: string;
  dateTo: string;
  modelBreakdown: ModelBreakdown[];
  agentBreakdown: AgentBreakdown[];
  timeline: TimelinePoint[];
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

const MODEL_COLORS = ["#22d3ee", "#3b82f6", "#14b8a6", "#0ea5e9", "#06b6d4", "#38bdf8", "#34d399", "#67e8f9"];

const AGENT_ICONS: Record<string, string> = {
  claude: "🧠",
  codex: "⚙️",
  gemini: "✨",
  opencode: "💻",
  droid: "🤖",
  copilot: "🛸",
};

const formatShortDate = (value: string): string => {
  const parsed = Date.parse(`${value}T00:00:00`);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(parsed));
};

const buildHeatmap = (timeline: TimelinePoint[], dateFrom: string, dateTo: string): HeatmapCell[] => {
  const byDate = new Map<string, TimelinePoint>();
  for (const point of timeline) byDate.set(point.date, point);

  const start = new Date(`${dateFrom}T00:00:00`);
  const end = new Date(`${dateTo}T00:00:00`);
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
    cursor.setDate(cursor.getDate() + 1);
  }

  return cells;
};

const chartWrapperClass = "h-56 w-full sm:h-64";

const formatTokensTooltip = (value: number | string | undefined) =>
  formatTokens(typeof value === "number" ? value : Number(value ?? 0));

const formatUsdTooltip = (value: number | string | undefined) =>
  formatUsd(typeof value === "number" ? value : Number(value ?? 0));

const formatNumberTooltip = (value: number | string | undefined) =>
  formatNumber(typeof value === "number" ? value : Number(value ?? 0));

const DashboardCharts = ({
  dateFrom,
  dateTo,
  modelBreakdown,
  agentBreakdown,
  timeline,
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

  const totalAgentTokens = agentBreakdown.reduce((sum, row) => sum + row.tokens, 0);
  const agentRows = agentBreakdown.map((row, index) => ({
    ...row,
    color: MODEL_COLORS[index % MODEL_COLORS.length],
    percentage: totalAgentTokens > 0 ? (row.tokens / totalAgentTokens) * 100 : 0,
    icon: AGENT_ICONS[row.source] ?? "🤝",
  }));

  const heatmap = buildHeatmap(timeline, dateFrom, dateTo);

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
                <BarChart data={modelRows} layout="vertical" margin={{ left: 12, right: 16 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.22)" strokeDasharray="2 5" />
                  <XAxis type="number" tick={{ fill: "#cbd5e1", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis
                    dataKey="model"
                    type="category"
                    tick={{ fill: "#e2e8f0", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={128}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(59,130,246,0.15)" }}
                    contentStyle={{
                      background: "rgba(2,6,23,0.95)",
                      border: "1px solid rgba(148,163,184,0.35)",
                      borderRadius: "12px",
                    }}
                    formatter={formatTokensTooltip}
                  />
                  <Bar dataKey="tokens" radius={[0, 10, 10, 0]}>
                    {modelRows.map((row) => (
                      <Cell key={row.model} fill={row.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2">
              {modelRows.map((row) => (
                <article key={row.model} className="wrapped-tile">
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
                  <p className="mt-2 text-xs text-slate-300">{formatTokens(row.tokens)}</p>
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
                    paddingAngle={3}
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
                    formatter={formatTokensTooltip}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {agentRows.map((row) => (
                <article key={row.source} className="wrapped-tile">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{row.icon} {row.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{row.percentage.toFixed(1)}%</p>
                  <p className="mt-1 text-xs text-slate-300">{formatTokens(row.tokens)} tokens</p>
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
            <div className="grid max-w-full grid-flow-col grid-rows-7 gap-1 overflow-x-auto rounded-2xl border border-white/12 bg-slate-950/45 p-4">
              {heatmap.map((cell) => {
                const alpha = 0.12 + cell.intensity * 0.88;
                const background =
                  cell.sessions > 0 ? `rgba(45,212,191,${alpha.toFixed(3)})` : "rgba(71,85,105,0.20)";

                return (
                  <div
                    key={cell.date}
                    className="h-4 w-4 rounded-[4px]"
                    style={{ background }}
                    title={`${formatDate(cell.date)} • ${formatTokens(cell.tokens)} • ${formatNumber(cell.sessions)} sessions`}
                  />
                );
              })}
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
