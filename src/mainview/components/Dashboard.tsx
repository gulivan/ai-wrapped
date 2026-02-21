import { useEffect, useRef, useState, type ChangeEvent } from "react";
import DashboardCharts from "./DashboardCharts";
import EmptyState from "./EmptyState";
import Sidebar from "./Sidebar";
import StatsCards, { AnimatedNumber } from "./StatsCards";
import { useDashboardData, type DashboardDateRange } from "../hooks/useDashboardData";
import { formatDate, formatDuration, formatNumber } from "../lib/formatters";

const useInView = <T extends HTMLElement>(threshold = 0.35) => {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, visible]);

  return { ref, visible };
};

const clampPercentage = (value: number): number => Math.max(0, Math.min(100, value));

const Dashboard = () => {
  const {
    dateFrom,
    dateTo,
    summary,
    timeline,
    loading,
    error,
    refresh,
    totals,
    modelBreakdown,
    agentBreakdown,
    topRepos,
    selectedRange,
    setSelectedRange,
    rangeOptions,
    dailyAgentTokensByDate,
    dailyAgentCostsByDate,
  } = useDashboardData();

  const handleRangeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value as DashboardDateRange;
    if (!rangeOptions.some((option) => option.value === next)) return;
    setSelectedRange(next);
  };

  const sidebar = (
    <Sidebar
      selectedRange={selectedRange}
      rangeOptions={rangeOptions}
      onRangeChange={handleRangeChange}
    />
  );

  if (loading && !summary) {
    return (
      <>
        {sidebar}
        <div className="wrapped-scroll">
          <section className="wrapped-card wrapped-card-loading">
            <EmptyState title="Building your coding story" description="Loading annual summary and timeline." />
          </section>
        </div>
      </>
    );
  }

  if (error && !summary) {
    return (
      <>
        {sidebar}
        <div className="wrapped-scroll">
          <section className="wrapped-card wrapped-card-loading">
            <EmptyState title="Unable to build wrapped view" description={error} />
            <button type="button" onClick={() => void refresh()} className="wrapped-button mt-4">
              Retry
            </button>
          </section>
        </div>
      </>
    );
  }

  const activeDayCoverage =
    totals.dateSpanDays > 0 ? clampPercentage((totals.activeDays / totals.dateSpanDays) * 100) : 0;
  const totalHours = totals.totalDurationMs / (60 * 60 * 1000);
  const totalDays = totals.totalDurationMs / (24 * 60 * 60 * 1000);
  const ringRadius = 58;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (activeDayCoverage / 100) * ringCircumference;

  return (
    <>
      {sidebar}
      <div className="wrapped-scroll">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-12 sm:px-6">
          <section className="wrapped-card wrapped-card-hero">
            <header className="mb-6">
              <p className="wrapped-kicker">Your Year In Code</p>
              <h1 className="text-4xl font-semibold tracking-[-0.03em] text-white sm:text-6xl">Your AI Coding Year</h1>
              <p className="mt-3 text-sm text-slate-200/90">
                {formatDate(dateFrom)} - {formatDate(dateTo)}
              </p>
            </header>

            <StatsCards
              totalSessions={totals.totalSessions}
              totalCostUsd={totals.totalCostUsd}
              totalTokens={totals.totalTokens}
              totalToolCalls={summary?.totals.toolCalls ?? 0}
            />
          </section>

          <section className="wrapped-card wrapped-card-time">
            <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="wrapped-kicker">Card 2</p>
                <h2 className="wrapped-title">Time Spent Coding with AI</h2>
              </div>
              <p className="text-sm text-slate-300">Active on {formatNumber(totals.activeDays)} days</p>
            </header>

            <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
              <div className="grid gap-3 sm:grid-cols-2">
                <article className="wrapped-tile">
                  <p className="wrapped-label">Total Hours</p>
                  <AnimatedNumber
                    value={totalHours}
                    animate={true}
                    format={(value) => `${value.toFixed(1)}h`}
                    className="mt-2 block text-4xl font-semibold text-white"
                  />
                  <p className="mt-2 text-xs text-slate-300">{totalDays.toFixed(1)} total days of coding time</p>
                </article>

                <article className="wrapped-tile">
                  <p className="wrapped-label">Average Session</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{formatDuration(totals.averageSessionDurationMs)}</p>
                  <p className="mt-2 text-xs text-slate-300">Per session across the full range</p>
                </article>

                <article className="wrapped-tile sm:col-span-2">
                  <p className="wrapped-label">Longest Session Highlight</p>
                  <p className="mt-2 text-3xl font-semibold text-white">
                    {formatDuration(totals.longestSessionEstimateMs)}
                  </p>
                  <p className="mt-2 text-xs text-slate-300">Estimated from daily totals and session counts</p>
                </article>

                <article className="wrapped-tile sm:col-span-2">
                  <p className="wrapped-label">Current Streak</p>
                  <p className="mt-2 text-3xl font-semibold text-white">
                    {formatNumber(totals.currentStreakDays)} {totals.currentStreakDays === 1 ? "day" : "days"}
                  </p>
                  <p className="mt-2 text-xs text-slate-300">Consecutive active days ending {formatDate(dateTo)}</p>
                </article>
              </div>

              <article className="wrapped-tile flex flex-col items-center justify-center text-center">
                <svg width="152" height="152" viewBox="0 0 152 152" className="overflow-visible">
                  <circle
                    cx="76"
                    cy="76"
                    r={ringRadius}
                    fill="none"
                    stroke="rgba(148,163,184,0.25)"
                    strokeWidth="12"
                  />
                  <circle
                    cx="76"
                    cy="76"
                    r={ringRadius}
                    fill="none"
                    stroke="url(#ringGradient)"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringOffset}
                    style={{
                      transition: "stroke-dashoffset 1000ms cubic-bezier(0.22, 1, 0.36, 1)",
                      transformOrigin: "50% 50%",
                      transform: "rotate(-90deg)",
                    }}
                  />
                  <defs>
                    <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#22d3ee" />
                      <stop offset="100%" stopColor="#0ea5e9" />
                    </linearGradient>
                  </defs>
                </svg>

                <AnimatedNumber
                  value={activeDayCoverage}
                  animate={true}
                  format={(value) => `${value.toFixed(1)}%`}
                  className="mt-4 block text-4xl font-semibold text-white"
                />
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-300">Days with activity</p>
              </article>
            </div>
          </section>

          <DashboardCharts
            dateFrom={dateFrom}
            dateTo={dateTo}
            modelBreakdown={modelBreakdown}
            agentBreakdown={agentBreakdown}
            timeline={timeline}
            dailyAgentTokensByDate={dailyAgentTokensByDate}
            dailyAgentCostsByDate={dailyAgentCostsByDate}
            topRepos={topRepos}
            totalCostUsd={totals.totalCostUsd}
            dailyAverageCostUsd={totals.dailyAverageCostUsd}
            mostExpensiveDay={totals.mostExpensiveDay}
          />
        </div>
      </div>
    </>
  );
};

export default Dashboard;
