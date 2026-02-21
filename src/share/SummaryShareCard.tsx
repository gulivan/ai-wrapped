import type { ShareSummaryPayload } from "@shared/shareData";
import { formatDate, formatNumber, formatTokens } from "../mainview/lib/formatters";
import { SOURCE_COLORS } from "../mainview/lib/constants";

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});

const COMPACT_USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  compactDisplay: "short",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const STANDARD_USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCountCompact = (value: number): string => {
  const safeValue = Math.max(0, value);
  if (safeValue < 1_000) return formatNumber(safeValue);
  return COMPACT_NUMBER_FORMATTER.format(safeValue);
};

const formatUsdCompact = (value: number): string =>
  Math.max(0, value) < 1_000
    ? STANDARD_USD_FORMATTER.format(Math.max(0, value))
    : COMPACT_USD_FORMATTER.format(Math.max(0, value));

const resolveWrappedTitle = (payload: ShareSummaryPayload): string =>
  `YOUR ${formatDate(payload.dateFrom)} - ${formatDate(payload.dateTo)} WRAPPED`;

interface SummaryShareCardProps {
  payload: ShareSummaryPayload;
}

const SummaryShareCard = ({ payload }: SummaryShareCardProps) => {
  const wrappedTitle = resolveWrappedTitle(payload);
  const longestStreakDays = Math.max(0, Math.round(payload.longestStreakDays));
  const topAgents = payload.topAgents.slice(0, 3);

  return (
    <main className="summary-share-shell">
      <article className="summary-share-card">
        <header className="summary-share-header">
          <p className="summary-share-kicker">{wrappedTitle}</p>
        </header>

        <section className="summary-share-metrics">
          <article className="summary-share-metric">
            <p className="summary-share-metric-value">{formatCountCompact(payload.totalSessions)}</p>
            <p className="summary-share-metric-label">Sessions</p>
          </article>
          <article className="summary-share-metric">
            <p className="summary-share-metric-value">{formatTokens(payload.totalTokens)}</p>
            <p className="summary-share-metric-label">Tokens</p>
          </article>
          <article className="summary-share-metric">
            <p className="summary-share-metric-value">{formatUsdCompact(payload.totalCostUsd)}</p>
            <p className="summary-share-metric-label">Total Cost</p>
          </article>
          <article className="summary-share-metric">
            <p className="summary-share-metric-value">{formatCountCompact(payload.totalToolCalls)}</p>
            <p className="summary-share-metric-label">Tool Calls</p>
          </article>
        </section>

        <section className="summary-share-panels">
          <article className="summary-share-panel">
            <p className="summary-share-panel-title">Top Agents</p>
            {topAgents.length === 0 ? (
              <p className="summary-share-empty">No activity</p>
            ) : (
              <ul className="summary-share-agent-list">
                {topAgents.map((entry) => (
                  <li key={`${entry.source}-${entry.label}`} className="summary-share-agent-row">
                    <span
                      className="summary-share-agent-dot"
                      style={{ backgroundColor: SOURCE_COLORS[entry.source] ?? "#22d3ee" }}
                    />
                    <span className="summary-share-agent-name">{entry.label}</span>
                    <span className="summary-share-agent-percent">{entry.percentage.toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="summary-share-panel summary-share-panel-ring">
            <div className="summary-share-streak-row">
              <p className="summary-share-streak-value">{formatNumber(longestStreakDays)}</p>
              <div className="summary-share-streak-copy">
                <p className="summary-share-streak-label">Longest</p>
                <p className="summary-share-streak-label">Streak</p>
                <p className="summary-share-streak-days">{longestStreakDays === 1 ? "Day" : "Days"}</p>
              </div>
            </div>
          </article>
        </section>
      </article>

      <footer className="wrapped-share-footer summary-share-footer">
        Made with AI Wrapped.{" "}
        <a className="share-link" href="https://ai-wrapped.com">
          Get yours at ai-wrapped.com
        </a>
      </footer>
    </main>
  );
};

export default SummaryShareCard;
