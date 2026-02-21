import EventTimeline from "./EventTimeline";
import EmptyState from "./EmptyState";
import AgentBadge from "./AgentBadge";
import { useSessionDetail } from "../hooks/useSessionDetail";
import { formatDateTime, formatDuration, formatTokens, formatUsd } from "../lib/formatters";

interface SessionDetailProps {
  sessionId: string | null;
  onBack: () => void;
}

const SessionDetail = ({ sessionId, onBack }: SessionDetailProps) => {
  const { session, events, loading, error } = useSessionDetail(sessionId);

  if (loading) {
    return <EmptyState title="Loading session" description="Fetching session events and metadata." />;
  }

  if (error) {
    return <EmptyState title="Failed to load session" description={error} />;
  }

  if (!session) {
    return <EmptyState title="Session not found" description="The session may have been removed." />;
  }

  const tokenTotal =
    session.totalTokens.inputTokens +
    session.totalTokens.outputTokens +
    session.totalTokens.cacheReadTokens +
    session.totalTokens.cacheWriteTokens +
    session.totalTokens.reasoningTokens;

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
      >
        Back to sessions
      </button>

      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <AgentBadge source={session.source} />
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">
              {session.title ?? session.repoName ?? session.id}
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">{session.repoName ?? "No repository"}</p>
          </div>

          <div className="grid gap-1 text-sm text-[var(--text-secondary)]">
            <span>Model: {session.model ?? "Unknown"}</span>
            <span>Started: {formatDateTime(session.startTime)}</span>
            <span>Duration: {formatDuration(session.durationMs)}</span>
            <span>Cost: {formatUsd(session.totalCostUsd)}</span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Tokens</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{formatTokens(tokenTotal)}</p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Messages</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{session.messageCount}</p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Tool Calls</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{session.toolCallCount}</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Event Timeline</h2>
        <EventTimeline events={events} />
      </section>
    </div>
  );
};

export default SessionDetail;
