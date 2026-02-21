import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS, SOURCE_COLORS } from "../lib/constants";
import EmptyState from "./EmptyState";

interface DashboardChartsProps {
  tokenUsageOverTime: Array<{
    date: string;
    claude: number;
    codex: number;
    gemini: number;
    opencode: number;
    droid: number;
    copilot: number;
  }>;
  costByAgent: Array<{ source: string; label: string; costUsd: number }>;
  costByModel: Array<{ model: string; costUsd: number }>;
  sessionsPerDay: Array<{ date: string; sessions: number }>;
  topTools: Array<{ tool: string; calls: number }>;
  topReposByCost: Array<{ repo: string; costUsd: number }>;
}

const chartCardClass = "rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4";

const DashboardCharts = ({
  tokenUsageOverTime,
  costByAgent,
  costByModel,
  sessionsPerDay,
  topTools,
  topReposByCost,
}: DashboardChartsProps) => {
  const hasAnyData =
    tokenUsageOverTime.length > 0 ||
    costByAgent.some((item) => item.costUsd > 0) ||
    costByModel.some((item) => item.costUsd > 0) ||
    sessionsPerDay.length > 0 ||
    topTools.length > 0 ||
    topReposByCost.length > 0;

  if (!hasAnyData) {
    return <EmptyState title="No dashboard data" description="Run a scan to populate charts." />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className={chartCardClass}>
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Token Usage Over Time</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={tokenUsageOverTime}>
              <CartesianGrid stroke="var(--border-soft)" strokeDasharray="2 4" />
              <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "12px",
                }}
              />
              <Legend wrapperStyle={{ color: "var(--text-secondary)", fontSize: "12px" }} />
              <Area type="monotone" dataKey="claude" stackId="tokens" stroke={SOURCE_COLORS.claude} fill={SOURCE_COLORS.claude} />
              <Area type="monotone" dataKey="codex" stackId="tokens" stroke={SOURCE_COLORS.codex} fill={SOURCE_COLORS.codex} />
              <Area type="monotone" dataKey="gemini" stackId="tokens" stroke={SOURCE_COLORS.gemini} fill={SOURCE_COLORS.gemini} />
              <Area type="monotone" dataKey="opencode" stackId="tokens" stroke={SOURCE_COLORS.opencode} fill={SOURCE_COLORS.opencode} />
              <Area type="monotone" dataKey="droid" stackId="tokens" stroke={SOURCE_COLORS.droid} fill={SOURCE_COLORS.droid} />
              <Area type="monotone" dataKey="copilot" stackId="tokens" stroke={SOURCE_COLORS.copilot} fill={SOURCE_COLORS.copilot} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className={chartCardClass}>
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Cost Breakdown By Agent</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={costByAgent}
                dataKey="costUsd"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={96}
                innerRadius={48}
                paddingAngle={2}
              >
                {costByAgent.map((item) => (
                  <Cell
                    key={item.source}
                    fill={SOURCE_COLORS[item.source as keyof typeof SOURCE_COLORS] ?? "#7dd3fc"}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "12px",
                }}
              />
              <Legend wrapperStyle={{ color: "var(--text-secondary)", fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className={chartCardClass}>
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Cost Breakdown By Model</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={costByModel} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid stroke="var(--border-soft)" strokeDasharray="2 4" />
              <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis
                dataKey="model"
                type="category"
                width={120}
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "12px",
                }}
              />
              <Bar dataKey="costUsd" fill="#86efac" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className={chartCardClass}>
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Sessions Per Day</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sessionsPerDay}>
              <CartesianGrid stroke="var(--border-soft)" strokeDasharray="2 4" />
              <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "12px",
                }}
              />
              <Bar dataKey="sessions" fill="#7dd3fc" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className={chartCardClass}>
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Top Tool Calls</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topTools} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid stroke="var(--border-soft)" strokeDasharray="2 4" />
              <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis
                dataKey="tool"
                type="category"
                width={120}
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "12px",
                }}
              />
              <Bar dataKey="calls" fill="#fcd34d" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className={chartCardClass}>
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Top Repositories By Cost</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topReposByCost} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid stroke="var(--border-soft)" strokeDasharray="2 4" />
              <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis
                dataKey="repo"
                type="category"
                width={120}
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "12px",
                }}
              />
              <Bar dataKey="costUsd" fill={CHART_COLORS[3]} radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
};

export default DashboardCharts;
