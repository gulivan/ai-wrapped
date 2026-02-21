import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { SESSION_SOURCES, type SessionSource } from "@shared/schema";
import DashboardCharts from "./DashboardCharts";
import EmptyState from "./EmptyState";
import Sidebar, { type ShareMenuAction } from "./Sidebar";
import StatsCards, { AnimatedNumber } from "./StatsCards";
import { useRPC } from "../hooks/useRPC";
import { useDashboardData, type DashboardDateRange } from "../hooks/useDashboardData";
import { SOURCE_LABELS } from "../lib/constants";
import { formatDate, formatDuration, formatNumber } from "../lib/formatters";
import {
  encodeShareData,
  encodeShareSummaryData,
  toShareSummaryPayload,
  type SharePayload,
} from "@shared/shareData";
import { downloadShareSummaryImage } from "../lib/shareImage";

const clampPercentage = (value: number): number => Math.max(0, Math.min(100, value));
const CARD_ANIMATION_MS = 2000;
const MAX_SHARE_HASH_LENGTH = 60000;
type CostAgentFilter = "all" | SessionSource;
type CostGroupBy = "none" | "by-agent" | "by-model";

const isCostGroupBy = (value: string): value is CostGroupBy =>
  value === "none" || value === "by-agent" || value === "by-model";

const isCostAgentFilter = (value: string): value is CostAgentFilter =>
  value === "all" || SESSION_SOURCES.includes(value as SessionSource);

const Dashboard = () => {
  const rpc = useRPC();
  const {
    dateFrom,
    dateTo,
    summary,
    timeline,
    loading,
    error,
    refresh,
    isScanning,
    totals,
    modelBreakdown,
    agentBreakdown,
    topRepos,
    selectedRange,
    setSelectedRange,
    rangeOptions,
    dailyAgentTokensByDate,
    dailyAgentCostsByDate,
    dailyModelCostsByDate,
    hourlyBreakdown,
    weekendSessionPercent,
    busiestDayOfWeek,
    busiestSingleDay,
  } = useDashboardData();
  const [costAgentFilter, setCostAgentFilter] = useState<CostAgentFilter>("all");
  const [costGroupBy, setCostGroupBy] = useState<CostGroupBy>("none");
  const [activeCardIndex, setActiveCardIndex] = useState<number>(1);
  const [animatingCardIndices, setAnimatingCardIndices] = useState<Record<number, boolean>>({});
  const [shareBusyAction, setShareBusyAction] = useState<ShareMenuAction | null>(null);
  const activeCardRef = useRef<number>(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const animatedCardIndicesRef = useRef<Set<number>>(new Set());
  const animationTimeoutByCardRef = useRef<Record<number, number>>({});
  const prefersReducedMotionRef = useRef<boolean>(false);

  const startCardAnimation = useCallback((index: number) => {
    if (index <= 0 || prefersReducedMotionRef.current) return;

    const existingTimeoutId = animationTimeoutByCardRef.current[index];
    if (existingTimeoutId) {
      window.clearTimeout(existingTimeoutId);
    }

    setAnimatingCardIndices((current) => ({ ...current, [index]: true }));
    animationTimeoutByCardRef.current[index] = window.setTimeout(() => {
      setAnimatingCardIndices((current) => {
        if (!current[index]) return current;
        const nextAnimations = { ...current };
        delete nextAnimations[index];
        return nextAnimations;
      });
      delete animationTimeoutByCardRef.current[index];
    }, CARD_ANIMATION_MS);
  }, []);

  const handleRangeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value as DashboardDateRange;
    if (!rangeOptions.some((option) => option.value === next)) return;
    setSelectedRange(next);
  };

  const costAgentOptions = useMemo<Array<{ value: CostAgentFilter; label: string }>>(
    () => [
      { value: "all", label: "All" },
      ...SESSION_SOURCES.map((source) => ({ value: source, label: SOURCE_LABELS[source] })),
    ],
    [],
  );

  const costGroupOptions = useMemo<Array<{ value: CostGroupBy; label: string }>>(
    () => [
      { value: "none", label: "None" },
      { value: "by-agent", label: "By agent" },
      { value: "by-model", label: "By model" },
    ],
    [],
  );

  const handleCostAgentChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    if (!isCostAgentFilter(next)) return;
    setCostAgentFilter(next);
  };

  const handleCostGroupByChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    if (!isCostGroupBy(next)) return;
    setCostGroupBy(next);
    if (next === "by-model") {
      setCostAgentFilter("all");
    }
  };

  const buildSharePayload = useCallback((): SharePayload | null => {
    if (!summary) return null;

    return {
      v: 1,
      range: selectedRange,
      dateFrom,
      dateTo,
      totalSessions: totals.totalSessions,
      totalCostUsd: totals.totalCostUsd,
      totalTokens: totals.totalTokens,
      totalToolCalls: summary.totals.toolCalls,
      totalDurationMs: totals.totalDurationMs,
      averageSessionDurationMs: totals.averageSessionDurationMs,
      longestSessionEstimateMs: totals.longestSessionEstimateMs,
      currentStreakDays: totals.currentStreakDays,
      currentStreakStartDate: totals.currentStreakStartDate,
      activeDays: totals.activeDays,
      dateSpanDays: totals.dateSpanDays,
      modelBreakdown,
      agentBreakdown,
      timeline,
      dailyAgentTokensByDate,
      dailyAgentCostsByDate,
      dailyModelCostsByDate,
      dailyAverageCostUsd: totals.dailyAverageCostUsd,
      mostExpensiveDay: totals.mostExpensiveDay,
      topRepos,
      hourlyBreakdown,
      weekendSessionPercent,
      busiestDayOfWeek,
      busiestSingleDay,
    };
  }, [
    agentBreakdown,
    busiestDayOfWeek,
    busiestSingleDay,
    dailyAgentCostsByDate,
    dailyAgentTokensByDate,
    dailyModelCostsByDate,
    dateFrom,
    dateTo,
    hourlyBreakdown,
    modelBreakdown,
    selectedRange,
    summary,
    timeline,
    topRepos,
    totals.activeDays,
    totals.averageSessionDurationMs,
    totals.currentStreakDays,
    totals.currentStreakStartDate,
    totals.dailyAverageCostUsd,
    totals.dateSpanDays,
    totals.longestSessionEstimateMs,
    totals.mostExpensiveDay,
    totals.totalCostUsd,
    totals.totalDurationMs,
    totals.totalSessions,
    totals.totalTokens,
    weekendSessionPercent,
  ]);

  const buildFullShareUrl = useCallback((payload: SharePayload): string => {
    const encoded = encodeShareData(payload);
    if (!encoded || encoded.length > MAX_SHARE_HASH_LENGTH) {
      throw new Error(`Encoded share payload exceeds safe URL length (${encoded.length} chars)`);
    }
    return `https://ai-wrapped.com/share#${encoded}`;
  }, []);

  const handleShareAction = useCallback(
    async (action: ShareMenuAction) => {
      if (shareBusyAction) return;

      const payload = buildSharePayload();
      if (!payload) return;

      setShareBusyAction(action);
      try {
        if (action === "download-image") {
          await downloadShareSummaryImage(toShareSummaryPayload(payload));
          return;
        }

        if (action === "open-summary-share") {
          const summaryEncoded = encodeShareSummaryData(toShareSummaryPayload(payload));
          if (!summaryEncoded || summaryEncoded.length > MAX_SHARE_HASH_LENGTH) {
            throw new Error(`Encoded summary payload exceeds safe URL length (${summaryEncoded.length} chars)`);
          }

          rpc.send.openExternal({
            url: `https://ai-wrapped.com/share?share_summary=${encodeURIComponent(summaryEncoded)}`,
          });
          return;
        }

        if (action === "open-full-share-no-repos") {
          rpc.send.openExternal({
            url: buildFullShareUrl({ ...payload, topRepos: [] }),
          });
          return;
        }

        rpc.send.openExternal({
          url: buildFullShareUrl(payload),
        });
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : "Failed to generate share output";
        console.error("Failed to process share action", { action, caught });
        window.alert(message);
      } finally {
        setShareBusyAction(null);
      }
    },
    [buildFullShareUrl, buildSharePayload, rpc, shareBusyAction],
  );

  useEffect(() => {
    prefersReducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return () => {
      for (const timeoutId of Object.values(animationTimeoutByCardRef.current)) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-card-index]"));
    if (cards.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          const index = Number((entry.target as HTMLElement).dataset.cardIndex ?? 0);
          if (index <= 0 || animatedCardIndicesRef.current.has(index)) continue;

          animatedCardIndicesRef.current.add(index);
          startCardAnimation(index);
        }

        const next = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => ({
            index: Number((entry.target as HTMLElement).dataset.cardIndex ?? 0),
            ratio: entry.intersectionRatio,
          }))
          .filter((entry) => entry.index > 0)
          .sort((left, right) => right.ratio - left.ratio)[0];

        if (!next || next.index === activeCardRef.current) return;

        activeCardRef.current = next.index;
        setActiveCardIndex(next.index);
      },
      {
        root,
        threshold: [0.25, 0.45, 0.65, 0.85],
      },
    );

    for (const card of cards) {
      observer.observe(card);
    }

    return () => observer.disconnect();
  }, [summary, error, startCardAnimation]);

  useEffect(() => {
    animatedCardIndicesRef.current.clear();

    for (const timeoutId of Object.values(animationTimeoutByCardRef.current)) {
      window.clearTimeout(timeoutId);
    }
    animationTimeoutByCardRef.current = {};
    setAnimatingCardIndices({});

    const currentCardIndex = activeCardRef.current > 0 ? activeCardRef.current : 1;
    if (currentCardIndex > 0) {
      animatedCardIndicesRef.current.add(currentCardIndex);
      startCardAnimation(currentCardIndex);
    }
  }, [selectedRange, costGroupBy, costAgentFilter, startCardAnimation]);

  const sidebar = (
    <Sidebar
      selectedRange={selectedRange}
      rangeOptions={rangeOptions}
      onRangeChange={handleRangeChange}
      showCostControls={activeCardIndex === 6}
      costAgentFilter={costAgentFilter}
      onCostAgentChange={handleCostAgentChange}
      costAgentOptions={costAgentOptions}
      costGroupBy={costGroupBy}
      onCostGroupByChange={handleCostGroupByChange}
      costGroupOptions={costGroupOptions}
      costAgentDisabled={costGroupBy === "by-model"}
      onShareAction={handleShareAction}
      shareBusyAction={shareBusyAction}
      isScanning={isScanning}
    />
  );

  if (loading && !summary) {
    return (
      <>
        {sidebar}
        <div ref={scrollRef} className="wrapped-scroll">
          <section data-card-index="1" className="wrapped-card wrapped-card-loading">
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
        <div ref={scrollRef} className="wrapped-scroll">
          <section data-card-index="1" className="wrapped-card wrapped-card-loading">
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
  const heroCopy = (() => {
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

    return { kicker: "Your Time In Code", title: "Your AI Coding Story" };
  })();
  const animateCard1 = Boolean(animatingCardIndices[1]);
  const animateCard2 = Boolean(animatingCardIndices[2]);

  return (
    <>
      {sidebar}
      <div ref={scrollRef} className="wrapped-scroll">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-12 sm:px-6">
          <section data-card-index="1" className="wrapped-card wrapped-card-hero">
            <header className="mb-6">
              <p className="wrapped-kicker">{heroCopy.kicker}</p>
              <h1 className="text-4xl font-semibold tracking-[-0.03em] text-white sm:text-6xl">{heroCopy.title}</h1>
              <p className="mt-3 text-sm text-slate-200/90">
                {formatDate(dateFrom)} - {formatDate(dateTo)}
              </p>
            </header>

            <StatsCards
              totalSessions={totals.totalSessions}
              totalCostUsd={totals.totalCostUsd}
              totalTokens={totals.totalTokens}
              totalToolCalls={summary?.totals.toolCalls ?? 0}
              animateOnMount={animateCard1}
            />
          </section>

          <section data-card-index="2" className="wrapped-card wrapped-card-time">
            <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
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
                    animate={animateCard2}
                    durationMs={CARD_ANIMATION_MS}
                    format={(value) => `${value.toFixed(1)}h`}
                    className="mt-2 block text-4xl font-semibold text-white"
                  />
                  <p className="mt-2 text-xs text-slate-300">{totalDays.toFixed(1)} total days of coding time</p>
                </article>

                <article className="wrapped-tile">
                  <p className="wrapped-label">Average Session</p>
                  <AnimatedNumber
                    value={totals.averageSessionDurationMs}
                    animate={animateCard2}
                    durationMs={CARD_ANIMATION_MS}
                    format={(value) => formatDuration(Math.max(0, Math.round(value)))}
                    className="mt-2 block text-3xl font-semibold text-white"
                  />
                  <p className="mt-2 text-xs text-slate-300">Per session across the full range</p>
                </article>

                <article className="wrapped-tile sm:col-span-2">
                  <p className="wrapped-label">Longest Session Highlight</p>
                  <AnimatedNumber
                    value={totals.longestSessionEstimateMs}
                    animate={animateCard2}
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
                      value={totals.currentStreakDays}
                      animate={animateCard2}
                      durationMs={CARD_ANIMATION_MS}
                      format={(value) => formatNumber(Math.max(0, Math.round(value)))}
                    />{" "}
                    {totals.currentStreakDays === 1 ? "day" : "days"}
                  </p>
                  <p className="mt-2 text-xs text-slate-300">
                    {totals.currentStreakStartDate
                      ? `Started ${formatDate(totals.currentStreakStartDate)}`
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
                  animate={animateCard2}
                  durationMs={CARD_ANIMATION_MS}
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
            dailyModelCostsByDate={dailyModelCostsByDate}
            topRepos={topRepos}
            totalCostUsd={totals.totalCostUsd}
            dailyAverageCostUsd={totals.dailyAverageCostUsd}
            mostExpensiveDay={totals.mostExpensiveDay}
            costAgentFilter={costAgentFilter}
            costGroupBy={costGroupBy}
            cardAnimations={animatingCardIndices}
            hourlyBreakdown={hourlyBreakdown}
            weekendSessionPercent={weekendSessionPercent}
            busiestDayOfWeek={busiestDayOfWeek}
            busiestSingleDay={busiestSingleDay}
          />
        </div>
      </div>
    </>
  );
};

export default Dashboard;
