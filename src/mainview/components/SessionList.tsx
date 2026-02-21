import type { SessionSource } from "@shared/schema";
import { useSessions } from "../hooks/useSessions";
import EmptyState from "./EmptyState";
import FilterBar from "./FilterBar";
import SearchInput from "./SearchInput";
import SessionListItem from "./SessionListItem";

interface SessionListProps {
  sources: SessionSource[];
  onSourcesChange: (sources: SessionSource[]) => void;
  onOpenSession: (sessionId: string) => void;
}

const SessionList = ({ sources, onSourcesChange, onOpenSession }: SessionListProps) => {
  const {
    sessions,
    total,
    loading,
    error,
    query,
    setQuery,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    model,
    setModel,
    repoName,
    setRepoName,
    sortBy,
    setSortBy,
    sortDir,
    setSortDir,
    page,
    setPage,
    pageCount,
    repoOptions,
    modelOptions,
  } = useSessions({ sources });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Session Browser</h1>
        <p className="text-sm text-[var(--text-secondary)]">Search and filter sessions by repo, agent source, and date range.</p>
      </header>

      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search by repo, model, title, or session id"
      />

      <FilterBar
        sources={sources}
        onSourcesChange={onSourcesChange}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        repoName={repoName}
        repoOptions={repoOptions}
        onRepoChange={setRepoName}
        model={model}
        modelOptions={modelOptions}
        onModelChange={setModel}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortByChange={setSortBy}
        onSortDirChange={setSortDir}
      />

      <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span>{total} total sessions</span>
        <span>
          Page {page} of {pageCount}
        </span>
      </div>

      {loading ? <EmptyState title="Loading sessions" description="Applying filters and fetching session list." /> : null}
      {!loading && error ? <EmptyState title="Unable to load sessions" description={error} /> : null}
      {!loading && !error && sessions.length === 0 ? (
        <EmptyState title="No sessions match these filters" description="Adjust filters or run a new scan." />
      ) : null}

      {!loading && !error && sessions.length > 0 ? (
        <div className="space-y-3">
          {sessions.map((session) => (
            <SessionListItem key={session.id} session={session} onOpen={onOpenSession} />
          ))}
        </div>
      ) : null}

      <footer className="flex items-center justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3">
        <button
          type="button"
          onClick={() => setPage((value) => Math.max(1, value - 1))}
          disabled={page <= 1}
          className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition enabled:hover:border-[var(--border-strong)] enabled:hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          disabled={page >= pageCount}
          className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition enabled:hover:border-[var(--border-strong)] enabled:hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </footer>
    </div>
  );
};

export default SessionList;
