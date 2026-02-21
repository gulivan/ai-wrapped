import { useEffect, useMemo, useState } from "react";
import type { SharePayload } from "@shared/shareData";
import { decodeShareData } from "@shared/shareData";
import DashboardCharts from "../mainview/components/DashboardCharts";
import StatsCards, { AnimatedNumber } from "../mainview/components/StatsCards";
import { formatDate, formatDuration, formatNumber } from "../mainview/lib/formatters";

const clampPercentage = (value: number): number => Math.max(0, Math.min(100, value));
const CARD_ANIMATION_MS = 2000;

const alwaysAnimatedCards: Record<number, boolean> = {
  1: true,
  2: true,
  3: true,
  4: true,
  5: true,
  6: true,
  7: true,
  8: true,
};

const readPayload = (): SharePayload | null => decodeShareData(window.location.hash);

const heroCopyFromRange = (selectedRange: string): { kicker: string; title: string } => {
  if (selectedRange === "last7") {
    return { kicker: "Your Last 7 Days In Code", title: "Your AI Coding Week" };
  }

  if (selectedRange === "last30") {
    return { kicker: "Your Last 30 Days In Code", title: "Your AI Coding Month" };
  }

  if (selectedRange === "last90") {
    return { kicker: "Your Last 90 Days In Code", title: "Your AI Coding Quarter" };
  }

  if (selectedRange === "last365") {
    return { kicker: "Your Last 365 Days In Code", title: "Your AI Coding Year" };
  }

  if (selectedRange.startsWith("year:")) {
    const year = Number(selectedRange.slice(5));
    if (Number.isInteger(year)) {
      const currentYear = new Date().getFullYear();
      if (year === currentYear) {
        return { kicker: "This Year In Code", title: "Your AI Coding Year" };
      }
      return { kicker: `${year} In Code`, title: `Your AI Coding ${year}` };
    }
  }

  return { kicker: "Shared Dashboard", title: "AI Wrapped" };
};

const SharePage = () => {
  const [payload, setPayload] = useState<SharePayload | null>(() => readPayload());

  useEffect(() => {
    const handleHashChange = () => {
      setPayload(readPayload());
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const heroCopy = useMemo(
    () => heroCopyFromRange(payload?.range ?? ""),
    [payload?.range],
  );

  if (!payload) {
    return (
      <main className="share-empty">
        <article className="share-empty-card">
          <p className="wrapped-kicker">AI Wrapped Share</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">No shared data found</h1>
          <p className="mt-3 text-sm text-slate-300">
            This link is missing valid dashboard data.
          </p>
          <p className="mt-4 text-sm text-slate-300">
            Create your own at{" "}
            <a className="share-link" href="https://ai-wrapped.com">
              ai-wrapped.com
            </a>
          </p>
        </article>
      </main>
    );
  }

  const activeDayCoverage =
    payload.dateSpanDays > 0 ? clampPercentage((payload.activeDays / payload.dateSpanDays) * 100) : 0;
  const totalHours = payload.totalDurationMs / (60 * 60 * 1000);
  const totalDays = payload.totalDurationMs / (24 * 60 * 60 * 1000);
  const ringRadius = 58;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (activeDayCoverage / 100) * ringCircumference;

  return (
    <main className="share-shell">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 sm:px-6">
        <section data-card-index="1" className="wrapped-card wrapped-card-hero">
          <header className="mb-6">
            <p className="wrapped-kicker">{heroCopy.kicker}</p>
            <h1 className="text-4xl font-semibold tracking-[-0.03em] text-white sm:text-6xl">{heroCopy.title}</h1>
            <p className="mt-3 text-sm text-slate-200/90">
              {formatDate(payload.dateFrom)} - {formatDate(payload.dateTo)}
            </p>
          </header>

          <StatsCards
            totalSessions={payload.totalSessions}
            totalCostUsd={payload.totalCostUsd}
            totalTokens={payload.totalTokens}
            totalToolCalls={payload.totalToolCalls}
            animateOnMount
          />
        </section>

        <section data-card-index="2" className="wrapped-card wrapped-card-time">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="wrapped-title">Time Spent Coding with AI</h2>
            </div>
            <p className="text-sm text-slate-300">Active on {formatNumber(payload.activeDays)} days</p>
          </header>

          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <div className="grid gap-3 sm:grid-cols-2">
              <article className="wrapped-tile">
                <p className="wrapped-label">Total Hours</p>
                <AnimatedNumber
                  value={totalHours}
                  animate
                  durationMs={CARD_ANIMATION_MS}
                  format={(value) => `${value.toFixed(1)}h`}
                  className="mt-2 block text-4xl font-semibold text-white"
                />
                <p className="mt-2 text-xs text-slate-300">{totalDays.toFixed(1)} total days of coding time</p>
              </article>

              <article className="wrapped-tile">
                <p className="wrapped-label">Average Session</p>
                <AnimatedNumber
                  value={payload.averageSessionDurationMs}
                  animate
                  durationMs={CARD_ANIMATION_MS}
                  format={(value) => formatDuration(Math.max(0, Math.round(value)))}
                  className="mt-2 block text-3xl font-semibold text-white"
                />
                <p className="mt-2 text-xs text-slate-300">Per session across the full range</p>
              </article>

              <article className="wrapped-tile sm:col-span-2">
                <p className="wrapped-label">Longest Session Highlight</p>
                <AnimatedNumber
                  value={payload.longestSessionEstimateMs}
                  animate
                  durationMs={CARD_ANIMATION_MS}
                  format={(value) => formatDuration(Math.max(0, Math.round(value)))}
                  className="mt-2 block text-3xl font-semibold text-white"
                />
                <p className="mt-2 text-xs text-slate-300">Estimated from daily totals and session counts</p>
              </article>

              <article className="wrapped-tile sm:col-span-2">
                <p className="wrapped-label">Current Streak 🔥</p>
                <p className="mt-2 text-3xl font-semibold text-white">
                  <AnimatedNumber
                    value={payload.currentStreakDays}
                    animate
                    durationMs={CARD_ANIMATION_MS}
                    format={(value) => formatNumber(Math.max(0, Math.round(value)))}
                  />{" "}
                  {payload.currentStreakDays === 1 ? "day" : "days"}
                </p>
                <p className="mt-2 text-xs text-slate-300">
                  {payload.currentStreakStartDate
                    ? `Started ${formatDate(payload.currentStreakStartDate)}`
                    : "No active streak in this range"}
                </p>
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
                  stroke="url(#shareRingGradient)"
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
                  <linearGradient id="shareRingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#22d3ee" />
                    <stop offset="100%" stopColor="#0ea5e9" />
                  </linearGradient>
                </defs>
              </svg>

              <AnimatedNumber
                value={activeDayCoverage}
                animate
                durationMs={CARD_ANIMATION_MS}
                format={(value) => `${value.toFixed(1)}%`}
                className="mt-4 block text-4xl font-semibold text-white"
              />
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-300">Days with activity</p>
            </article>
          </div>
        </section>

        <DashboardCharts
          dateFrom={payload.dateFrom}
          dateTo={payload.dateTo}
          modelBreakdown={payload.modelBreakdown}
          agentBreakdown={payload.agentBreakdown}
          timeline={payload.timeline}
          dailyAgentTokensByDate={payload.dailyAgentTokensByDate}
          dailyAgentCostsByDate={payload.dailyAgentCostsByDate}
          dailyModelCostsByDate={payload.dailyModelCostsByDate}
          topRepos={payload.topRepos}
          totalCostUsd={payload.totalCostUsd}
          dailyAverageCostUsd={payload.dailyAverageCostUsd}
          mostExpensiveDay={payload.mostExpensiveDay}
          costAgentFilter="all"
          costGroupBy="none"
          cardAnimations={alwaysAnimatedCards}
          hourlyBreakdown={payload.hourlyBreakdown}
          weekendSessionPercent={payload.weekendSessionPercent}
          busiestDayOfWeek={payload.busiestDayOfWeek}
          busiestSingleDay={payload.busiestSingleDay}
        />

        <footer className="wrapped-share-footer">
          Made with AI Wrapped.{" "}
          <a className="share-link" href="https://ai-wrapped.com">
            Get yours at ai-wrapped.com
          </a>
        </footer>
      </div>
    </main>
  );
};

export default SharePage;
