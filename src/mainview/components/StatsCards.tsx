import { formatNumber, formatTokens, formatUsd } from "../lib/formatters";

interface StatsCardsProps {
  totalTokens: number;
  totalCostUsd: number;
  totalSessions: number;
  totalToolCalls: number;
}

const cardClass = "rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5";

const StatsCards = ({ totalTokens, totalCostUsd, totalSessions, totalToolCalls }: StatsCardsProps) => {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <section className={cardClass}>
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Total Tokens</p>
        <p className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">{formatTokens(totalTokens)}</p>
      </section>

      <section className={cardClass}>
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Total Cost</p>
        <p className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">{formatUsd(totalCostUsd)}</p>
      </section>

      <section className={cardClass}>
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Total Sessions</p>
        <p className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">{formatNumber(totalSessions)}</p>
      </section>

      <section className={cardClass}>
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Total Tool Calls</p>
        <p className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">{formatNumber(totalToolCalls)}</p>
      </section>
    </div>
  );
};

export default StatsCards;
