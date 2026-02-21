import type { SessionSource } from "@shared/schema";
import { useDashboardData } from "../hooks/useDashboardData";
import DashboardCharts from "./DashboardCharts";
import EmptyState from "./EmptyState";
import StatsCards from "./StatsCards";

interface DashboardProps {
  sources: SessionSource[];
}

const Dashboard = ({ sources }: DashboardProps) => {
  const {
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    loading,
    error,
    refresh,
    cards,
    chartData,
  } = useDashboardData(sources);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Dashboard</h1>
          <p className="text-sm text-[var(--text-secondary)]">Session activity, events, and tool usage trends.</p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-[var(--text-muted)]">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="ml-2 h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border-strong)]"
            />
          </label>
          <label className="text-xs text-[var(--text-muted)]">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="ml-2 h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border-strong)]"
            />
          </label>
          <button
            type="button"
            onClick={() => void refresh()}
            className="h-9 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-bg)] px-3 text-xs font-semibold text-[var(--accent-text)] transition hover:brightness-110"
          >
            Refresh
          </button>
        </div>
      </header>

      {loading ? <EmptyState title="Loading dashboard" description="Collecting summary and chart data." /> : null}
      {!loading && error ? <EmptyState title="Unable to load dashboard" description={error} /> : null}

      {!loading && !error ? (
        <>
          <StatsCards
            totalTokens={cards.totalTokens}
            totalCostUsd={cards.totalCostUsd}
            totalSessions={cards.totalSessions}
            totalToolCalls={cards.totalToolCalls}
          />
          <DashboardCharts
            tokenUsageOverTime={chartData.tokenUsageOverTime}
            costByAgent={chartData.costByAgent}
            costByModel={chartData.costByModel}
            sessionsPerDay={chartData.sessionsPerDay}
            topTools={chartData.topTools}
            topReposByCost={chartData.topReposByCost}
          />
        </>
      ) : null}
    </div>
  );
};

export default Dashboard;
