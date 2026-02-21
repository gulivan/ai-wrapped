import type { Session } from "@shared/schema";
import AgentBadge from "./AgentBadge";
import { formatDateTime, formatDuration, formatRelativeTime, formatTokens, formatUsd } from "../lib/formatters";

interface SessionListItemProps {
  session: Session;
  onOpen: (sessionId: string) => void;
}

const SessionListItem = ({ session, onOpen }: SessionListItemProps) => {
  const tokenCount =
    session.totalTokens.inputTokens +
    session.totalTokens.outputTokens +
    session.totalTokens.cacheReadTokens +
    session.totalTokens.cacheWriteTokens +
    session.totalTokens.reasoningTokens;

  return (
    <button
      type="button"
      onClick={() => onOpen(session.id)}
      className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <AgentBadge source={session.source} />
          <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {session.title ?? session.repoName ?? session.id}
          </h3>
          <p className="truncate text-xs text-[var(--text-secondary)]">
            {session.repoName ?? "No repository"}
            {session.gitBranch ? ` / ${session.gitBranch}` : ""}
          </p>
        </div>

        <div className="grid gap-1 text-right text-xs">
          <span className="font-medium text-[var(--text-primary)]">{formatTokens(tokenCount)} tokens</span>
          <span className="text-[var(--text-secondary)]">{formatUsd(session.totalCostUsd)} cost</span>
          <span className="text-[var(--text-secondary)]">{session.eventCount} events</span>
          <span className="text-[var(--text-secondary)]">{session.toolCallCount} tool calls</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
        <span>{formatDuration(session.durationMs)}</span>
        <span>{formatDateTime(session.startTime)}</span>
        <span>{formatRelativeTime(session.startTime)}</span>
        <span>{session.model ?? "Unknown model"}</span>
      </div>
    </button>
  );
};

export default SessionListItem;
